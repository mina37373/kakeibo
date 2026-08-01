import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { imageBase64 } = await req.json()
  const apiKey = process.env.GOOGLE_VISION_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'no key' }, { status: 500 })

  const res = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [{ image: { content: imageBase64 }, features: [{ type: 'TEXT_DETECTION' }] }]
    }),
  })
  const json = await res.json()
  const text = json.responses?.[0]?.fullTextAnnotation?.text ?? ''
  return NextResponse.json({ text })
}
