// Apple/Google Wallet stubs. Real .pkpass generation requires Apple WWDR cert
// and a signing pipeline. Real Google Wallet requires SA JWT signing with
// JWS RS256. Both implemented as TODOs awaiting credentials.

export async function generateApplePassUrl(ticket_id: string, signed_token: string): Promise<string> {
  const cert = Deno.env.get('APPLE_PASS_CERT_PEM');
  if (!cert || cert === '__base64__') {
    return `${Deno.env.get('APP_BASE_URL')}/mi-boleta?t=${signed_token}&wallet=apple-pending`;
  }
  // TODO(deps): real .pkpass generation when Apple certs provisioned.
  return `${Deno.env.get('APP_BASE_URL')}/wallet/apple/${ticket_id}.pkpass`;
}

export async function generateGoogleWalletSaveUrl(ticket_id: string): Promise<string> {
  const sa = Deno.env.get('GOOGLE_WALLET_SERVICE_ACCOUNT_JSON');
  if (!sa || sa === '__base64__') {
    return `${Deno.env.get('APP_BASE_URL')}/mi-boleta?t=${ticket_id}&wallet=google-pending`;
  }
  // TODO(deps): real Google Wallet JWT when SA JSON provisioned.
  return `https://pay.google.com/gp/v/save/PLACEHOLDER`;
}
