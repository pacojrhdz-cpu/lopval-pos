// Vercel Serverless Function — POST /api/create-invoice
// Llama a Facturapi manteniendo el Secret Key en el servidor

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const FACTURAPI_KEY = process.env.FACTURAPI_SECRET_KEY
  if (!FACTURAPI_KEY) {
    return res.status(500).json({ error: 'FACTURAPI_SECRET_KEY no configurado en variables de entorno' })
  }

  const { customer, items, payment_form, use = 'G03' } = req.body ?? {}

  if (!customer || !items || !payment_form) {
    return res.status(400).json({ error: 'Faltan campos: customer, items, payment_form' })
  }

  try {
    const facResponse = await fetch('https://www.facturapi.io/v2/invoices', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${FACTURAPI_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'I',       // Ingreso
        customer,
        items,
        payment_form,   // "01" efectivo | "28" débito | "03" transferencia | "04" crédito
        use,             // "G03" Gastos en general (default restaurante)
        currency: 'MXN',
      }),
    })

    const data = await facResponse.json()

    if (!facResponse.ok) {
      console.error('Facturapi error:', JSON.stringify(data))
      return res.status(facResponse.status).json(data)
    }

    return res.status(200).json(data)
  } catch (err) {
    console.error('Error llamando a Facturapi:', err)
    return res.status(500).json({ error: err.message })
  }
}
