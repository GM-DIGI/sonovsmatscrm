import { createFileRoute } from '@tanstack/react-router'

const AIRTABLE_BASE_ID = 'app5Qc3TGrdPeEqBD'
const AIRTABLE_TABLE = 'leads'
const GATEWAY_URL = 'https://connector-gateway.lovable.dev/airtable'

type Payload = {
  leadId: string
  operation: 'INSERT' | 'UPDATE'
}

function mapLeadToFields(lead: Record<string, unknown>) {
  return {
    'Lead ID': lead.id,
    'Client Name': lead.client_name ?? null,
    Email: lead.email ?? null,
    Phone: lead.phone ?? null,
    Budget: lead.budget ?? null,
    'Property Type': lead.property_type ?? null,
    Status: lead.status ?? null,
    Source: lead.source ?? null,
    Campaign: lead.campaign ?? null,
    Notes: lead.notes ?? null,
    'AI Score': lead.ai_score ?? null,
    'Created At': lead.created_at ?? null,
  }
}

export const Route = createFileRoute('/api/public/hooks/airtable-sync-lead')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Verify caller with the anon apikey header (set by pg_cron/pg_net)
        const apikey = request.headers.get('apikey')
        if (!apikey || apikey !== process.env.SUPABASE_PUBLISHABLE_KEY) {
          return new Response('Unauthorized', { status: 401 })
        }

        const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY
        const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY
        if (!LOVABLE_API_KEY || !AIRTABLE_API_KEY) {
          return new Response('Airtable not configured', { status: 500 })
        }

        let body: Payload
        try {
          body = (await request.json()) as Payload
        } catch {
          return new Response('Invalid JSON', { status: 400 })
        }

        if (!body?.leadId) {
          return new Response('Missing leadId', { status: 400 })
        }

        const { supabaseAdmin } = await import('@/integrations/supabase/client.server')

        const { data: lead, error } = await supabaseAdmin
          .from('leads')
          .select('*, airtable_record_id')
          .eq('id', body.leadId)
          .maybeSingle()

        if (error || !lead) {
          return new Response(JSON.stringify({ error: error?.message ?? 'Lead not found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        const fields = mapLeadToFields(lead as unknown as Record<string, unknown>)
        const airtableRecordId = (lead as { airtable_record_id?: string | null }).airtable_record_id
        const table = encodeURIComponent(AIRTABLE_TABLE)

        const headers = {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          'X-Connection-Api-Key': AIRTABLE_API_KEY,
          'Content-Type': 'application/json',
        }

        let airtableResp: Response
        if (airtableRecordId) {
          // Update existing record
          airtableResp = await fetch(
            `${GATEWAY_URL}/v0/${AIRTABLE_BASE_ID}/${table}/${airtableRecordId}`,
            {
              method: 'PATCH',
              headers,
              body: JSON.stringify({ fields, typecast: true }),
            },
          )

          // If record was deleted upstream, recreate it
          if (airtableResp.status === 404) {
            airtableResp = await fetch(`${GATEWAY_URL}/v0/${AIRTABLE_BASE_ID}/${table}`, {
              method: 'POST',
              headers,
              body: JSON.stringify({ records: [{ fields }], typecast: true }),
            })
            if (airtableResp.ok) {
              const created = (await airtableResp.clone().json()) as {
                records: Array<{ id: string }>
              }
              const newId = created.records?.[0]?.id
              if (newId) {
                await supabaseAdmin
                  .from('leads')
                  .update({ airtable_record_id: newId })
                  .eq('id', body.leadId)
              }
            }
          }
        } else {
          // Create new record
          airtableResp = await fetch(`${GATEWAY_URL}/v0/${AIRTABLE_BASE_ID}/${table}`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ records: [{ fields }], typecast: true }),
          })

          if (airtableResp.ok) {
            const created = (await airtableResp.clone().json()) as {
              records: Array<{ id: string }>
            }
            const newId = created.records?.[0]?.id
            if (newId) {
              await supabaseAdmin
                .from('leads')
                .update({ airtable_record_id: newId })
                .eq('id', body.leadId)
            }
          }
        }

        if (!airtableResp.ok) {
          const text = await airtableResp.text()
          console.error('Airtable sync failed', airtableResp.status, text)
          return new Response(
            JSON.stringify({ error: 'Airtable request failed', status: airtableResp.status, body: text }),
            { status: 502, headers: { 'Content-Type': 'application/json' } },
          )
        }

        return Response.json({ ok: true, operation: body.operation })
      },
    },
  },
})
