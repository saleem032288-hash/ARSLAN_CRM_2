// ============================================================
// WhatsApp connection resolver.
//
// Background: before multi-connection support, `whatsapp_config`
// held exactly one row per account (UNIQUE(account_id)) and every
// sender did `.eq('account_id', accountId).single()`. That breaks
// the moment an account can own N numbers — `.single()` errors on
// ≥2 rows.
//
// This module is the single place that answers "which connection?"
// for account-level operations (broadcasts, flows, automations, the
// public API, media proxy, …). Conversation-scoped sends should use
// `resolveConnectionForConversation` so a reply always goes out on
// the number that owns the thread (task requirement #15).
//
// The connection row still lives in `whatsapp_config` (see migration
// 048 for why we refactored it in place rather than duplicating the
// table). `id` IS the `whatsapp_connection_id` referenced by
// conversations/messages/broadcasts.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'

export interface WhatsAppConnection {
  id: string
  account_id: string
  user_id: string
  name: string | null
  business_id: string | null
  waba_id: string | null
  phone_number_id: string
  phone_number: string | null
  display_name: string | null
  profile_picture_url: string | null
  app_id: string | null
  app_secret: string | null
  access_token: string
  verify_token: string | null
  status: string
  connected_at: string | null
  registered_at: string | null
  subscribed_apps_at: string | null
  last_registration_error: string | null
  last_webhook_at: string | null
  last_error: string | null
  last_health_check_at: string | null
  mirror_inbound_media: boolean | null
  created_at: string
  updated_at: string
}

/**
 * Columns safe to ship to the browser. Deliberately omits
 * `access_token`, `verify_token` and `app_secret`.
 */
export const CONNECTION_PUBLIC_COLUMNS =
  'id, account_id, name, business_id, waba_id, phone_number_id, phone_number, ' +
  'display_name, profile_picture_url, app_id, status, connected_at, ' +
  'registered_at, subscribed_apps_at, last_registration_error, ' +
  'last_webhook_at, last_error, last_health_check_at, mirror_inbound_media, ' +
  'created_at, updated_at'

/** Human label for a connection card / inbox filter. */
export function connectionLabel(
  c: Pick<
    WhatsAppConnection,
    'name' | 'display_name' | 'phone_number' | 'phone_number_id'
  >,
): string {
  return (
    c.name?.trim() ||
    c.display_name?.trim() ||
    c.phone_number?.trim() ||
    c.phone_number_id
  )
}

/** Is this connection usable for outbound sends? */
export function isConnectionUsable(
  c: Pick<WhatsAppConnection, 'status'>,
): boolean {
  return c.status === 'connected' || c.status === 'warning'
}

/**
 * All connections for an account, oldest first. Small N (a handful),
 * so callers can safely hold the whole list in memory.
 */
export async function listConnections(
  db: SupabaseClient,
  accountId: string,
): Promise<WhatsAppConnection[]> {
  const { data, error } = await db
    .from('whatsapp_config')
    .select('*')
    .eq('account_id', accountId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[connections] list failed:', error.message)
    return []
  }
  return (data ?? []) as WhatsAppConnection[]
}

/**
 * Pick the default connection for account-level operations.
 * Prefers the oldest *connected* row; falls back to the oldest row so
 * diagnostics still work when everything is disconnected.
 */
export function pickDefaultConnection(
  rows: WhatsAppConnection[],
): WhatsAppConnection | null {
  if (rows.length === 0) return null
  return rows.find((r) => isConnectionUsable(r)) ?? rows[0]
}

/** Default connection for account-scoped sends. */
export async function resolveDefaultConnection(
  db: SupabaseClient,
  accountId: string,
): Promise<WhatsAppConnection | null> {
  return pickDefaultConnection(await listConnections(db, accountId))
}

/** A specific connection, scoped to the account. */
export async function resolveConnectionById(
  db: SupabaseClient,
  accountId: string,
  connectionId: string,
): Promise<WhatsAppConnection | null> {
  const { data } = await db
    .from('whatsapp_config')
    .select('*')
    .eq('account_id', accountId)
    .eq('id', connectionId)
    .maybeSingle()
  return (data as WhatsAppConnection | null) ?? null
}

/**
 * The connection that owns a conversation, falling back to the
 * account default for legacy/unlinked conversations. This is the
 * source of truth for outbound replies.
 */
export async function resolveConnectionForConversation(
  db: SupabaseClient,
  accountId: string,
  conversationId: string,
): Promise<WhatsAppConnection | null> {
  const { data: conv } = await db
    .from('conversations')
    .select('whatsapp_connection_id')
    .eq('id', conversationId)
    .eq('account_id', accountId)
    .maybeSingle()

  const connectionId = (
    conv as { whatsapp_connection_id?: string | null } | null
  )?.whatsapp_connection_id

  if (connectionId) {
    const conn = await resolveConnectionById(db, accountId, connectionId)
    if (conn) return conn
  }
  return resolveDefaultConnection(db, accountId)
}
