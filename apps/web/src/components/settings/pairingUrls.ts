import { setPairingTokenOnUrl } from "@t3tools/shared/remote";

/** The environment serves the web app itself, so its own `/pair` route accepts the token. */
export function resolvePairingUrl(endpointUrl: string, credential: string): string {
  const url = new URL(endpointUrl);
  url.pathname = "/pair";
  return setPairingTokenOnUrl(url, credential).toString();
}
