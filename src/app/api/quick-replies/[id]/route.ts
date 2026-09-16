import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { validateInteractivePayload } from '@/lib/whatsapp/interactive'

const MEDIA_KINDS = ['image', 'video', 'document', 'audio'] as const
type MediaKind = (typeof MEDIA_KINDS)[number]

function isMediaKind(value: unknown): value is MediaKind {
  return typeof value === 'string' && (MEDIA_KINDS as readonly string[]).includes(value)
}

// Update / delete a single quick reply. Quick replies are account-
// shared, so every mutation is scoped by `account_id` (the service-role
// client bypasses the agent-gated RLS, so both the role check and the
// account scope are enforced here).

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  let ctx
  try {
    ctx = await requireRole('agent')
  } catch (err) {
    return toErrorResponse(err)
  }

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const update: Record<string, unknown> = {}
  if (typeof body.title === 'string') {
    const title = body.title.trim()
    if (!title) return NextResponse.json({ error: 'title cannot be empty' }, { status: 400 })
    update.title = title
  }

  // When `kind` is supplied (e.g. the editor flips Text ⟷ Interactive ⟷
  // Media), it drives which content columns are authoritative and the
  // others are cleared — otherwise a switched row keeps a stale payload
  // the picker mis-routes on.
  if ('kind' in body) {
    if (body.kind !== 'text' && body.kind !== 'interactive' && body.kind !== 'media') {
      return NextResponse.json(
        { error: 'kind must be "text", "interactive", or "media"' },
        { status: 400 },
      )
    }
    update.kind = body.kind
    if (body.kind === 'interactive') {
      const result = validateInteractivePayload(body.interactive_payload)
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
      update.interactive_payload = body.interactive_payload
      update.content_text = null
      update.media_type = null
      update.media_url = null
    } else if (body.kind === 'media') {
      if (!isMediaKind(body.media_type)) {
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
      update.media_type = body.media_type
      update.media_url = mediaUrl
      update.content_text = typeof body.content_text === 'string' ? body.content_text : null
      update.interactive_payload = null
    } else {
      const text = typeof body.content_text === 'string' ? body.content_text : ''
      if (!text.trim()) {
        return NextResponse.json(
          { error: 'content_text is required for text quick replies' },
          { status: 400 },
        )
      }
      update.content_text = text
      update.interactive_payload = null
      update.media_type = null
      update.media_url = null
    }
  } else {
    // No kind change — allow partial edits of whichever field the row uses.
    if ('content_text' in body) update.content_text = body.content_text ?? null
    if ('interactive_payload' in body) {
      if (body.interactive_payload != null) {
        const result = validateInteractivePayload(body.interactive_payload)
        if (!result.ok) {
          return NextResponse.json({ error: result.error }, { status: 400 })
        }
      }
      update.interactive_payload = body.interactive_payload ?? null
    }
    if ('media_type' in body) {
      if (!isMediaKind(body.media_type)) {
        return NextResponse.json(
          { error: 'media_type is required (image, video, document, or audio)' },
          { status: 400 },
        )
      }
      update.media_type = body.media_type
    }
    if ('media_url' in body) {
      const mediaUrl = typeof body.media_url === 'string' ? body.media_url.trim() : ''
      if (!mediaUrl) {
        return NextResponse.json(
          { error: 'media_url is required for media quick replies' },
          { status: 400 },
        )
      }
      update.media_url = mediaUrl
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: true })
  }

  const { error } = await supabaseAdmin()
    .from('quick_replies')
    .update(update)
    .eq('id', id)
    .eq('account_id', ctx.accountId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  let ctx
  try {
    ctx = await requireRole('agent')
  } catch (err) {
    return toErrorResponse(err)
  }

  const { error } = await supabaseAdmin()
    .from('quick_replies')
    .delete()
    .eq('id', id)
    .eq('account_id', ctx.accountId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
