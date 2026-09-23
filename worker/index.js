const CONSENT_TARGET = 'https://hgrinvdxkbqggwgbzpge.supabase.co/functions/v1/factory-mcp-oauth/authorize'

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    if (url.pathname === '/oauth/consent') {
      const target = new URL(CONSENT_TARGET)
      target.search = url.search
      return Response.redirect(target.toString(), 302)
    }

    return env.ASSETS.fetch(request)
  },
}
