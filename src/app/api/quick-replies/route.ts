import { NextResponse } from 'next/server'
import { getCurrentAccount, requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { validateInteractivePayload } from '@/lib/whatsapp/interactive'

// Quick replies — reusable snippets (plain text, a saved interactive
// message, or a media file with an optional caption) shared across the
// account. GET lists; POST creates. Mirrors the automations route:
// RLS-scoped read via the user client, service-role write after an
// explicit role check.

const MEDIA_KINDS = ['image', 'video', 'document', 'audio'] as const
type MediaKind = (typeof MEDIA_KINDS)[number]

function isMediaKind(value: unknown): value is MediaKind {
  return typeof value === 'string' && (MEDIA_KINDS as readonly string[]).includes(value)
}

export async function GET() {
  try {
    const { supabase } = await getCurrentAccount()
    // RLS (quick_replies_select) scopes to the caller's account.
    const { data, error } = await supabase
      .from('quick_replies')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ quick_replies: data ?? [] })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function POST(request: Request) {
  let ctx
  try {
    ctx = await requireRole('agent')
  } catch (err) {
    return toErrorResponse(err)
  }

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const title = typeof body.title === 'string' ? body.title.trim() : ''
  const kind =
    body.kind === 'interactive' ? 'interactive' : body.kind === 'media' ? 'media' : 'text'
  if (!title) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 })
  }

  let content_text: string | null = null
  let interactive_payload: unknown = null
  let media_type: string | null = null
  let media_url: string | null = null

  if (kind === 'interactive') {
    const result = validateInteractivePayload(body.interactive_payload)
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }
    interactive_payload = body.interactive_payload
  } else if (kind === 'media') {
    // Media quick replies carry a file in storage + an optional caption.
    // The URL is persisted as-is (no re-upload on send — the picker hands
    // the composer the same URL the manager saved).
    const mediaType = body.media_type
    if (!isMediaKind(mediaType)) {
      return NextResponse.json(
        { error: 'media_type is required (image, video, document, or audio)' },
        { status: 400 },
      )
    }
    const mediaUrl = typeof body.media_url === 'string' ? body.media_url.trim() : ''
    if (!mediaUrl) {
      return NextResponse.json(
        { error: 'media_url is required for media quick replies' },
        { status: 400 },
      )
    }
    media_type = mediaType
    media_url = mediaUrl
    content_text = typeof body.content_text === 'string' ? body.content_text : null
  } else {
    const text = typeof body.content_text === 'string' ? body.content_text : ''
    if (!text.trim()) {
      return NextResponse.json(
        { error: 'content_text is required for text quick replies' },
        { status: 400 },
      )
    }
    content_text = text
  }

  const { data, error } = await supabaseAdmin()
    .from('quick_replies')
    .insert({
      account_id: ctx.accountId,
      user_id: ctx.userId,
      title,
      kind,
      content_text,
      interactive_payload,
      media_type,
      media_url,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ quick_reply: data }, { status: 201 })
}
