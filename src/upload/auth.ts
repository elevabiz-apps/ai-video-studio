import {google} from "googleapis";
import {readFileSync, writeFileSync, existsSync} from "fs";
import path from "path";
import {createInterface} from "readline";
import {StoredTokens, StoredTokensSchema, OAuthTokens} from "./types";

const TOKENS_PATH = path.join(process.cwd(), ".upload-tokens.json");

const SCOPES = {
  youtube: ["https://www.googleapis.com/auth/youtube.upload"],
};

function loadTokens(): StoredTokens {
  if (!existsSync(TOKENS_PATH)) return {};
  const raw = JSON.parse(readFileSync(TOKENS_PATH, "utf-8"));
  return StoredTokensSchema.parse(raw);
}

function saveTokens(tokens: StoredTokens): void {
  writeFileSync(TOKENS_PATH, JSON.stringify(tokens, null, 2));
}

function prompt(question: string): Promise<string> {
  const rl = createInterface({input: process.stdin, output: process.stdout});
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export function createYouTubeOAuth2() {
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  const redirectUri = process.env.YOUTUBE_REDIRECT_URI || "urn:ietf:wg:oauth:2.0:oob";

  if (!clientId || !clientSecret) {
    throw new Error(
      "Missing YOUTUBE_CLIENT_ID or YOUTUBE_CLIENT_SECRET in .env\n" +
      "Run: npx tsx scripts/setup-upload.ts"
    );
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export async function getYouTubeAuth() {
  const oauth2 = createYouTubeOAuth2();
  const tokens = loadTokens();

  if (tokens.youtube) {
    oauth2.setCredentials(tokens.youtube);

    // Refresh if expired
    if (tokens.youtube.expiry_date && tokens.youtube.expiry_date < Date.now()) {
      console.log("Refreshing YouTube token...");
      const {credentials} = await oauth2.refreshAccessToken();
      const updated: OAuthTokens = {
        access_token: credentials.access_token!,
        refresh_token: credentials.refresh_token || tokens.youtube.refresh_token,
        expiry_date: credentials.expiry_date!,
        token_type: credentials.token_type || "Bearer",
        scope: credentials.scope || undefined,
      };
      oauth2.setCredentials(updated);
      saveTokens({...tokens, youtube: updated});
    }

    return oauth2;
  }

  // First-time auth flow
  const authUrl = oauth2.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES.youtube,
    prompt: "consent",
  });

  console.log("\n=== YouTube Authorization ===");
  console.log("1. Open this URL in your browser:\n");
  console.log(authUrl);
  console.log("\n2. Sign in and authorize the app");
  console.log("3. Copy the authorization code and paste it below\n");

  const code = await prompt("Authorization code: ");

  const {tokens: newTokens} = await oauth2.getToken(code);
  const oauthTokens: OAuthTokens = {
    access_token: newTokens.access_token!,
    refresh_token: newTokens.refresh_token!,
    expiry_date: newTokens.expiry_date!,
    token_type: newTokens.token_type || "Bearer",
    scope: newTokens.scope || undefined,
  };

  oauth2.setCredentials(oauthTokens);
  saveTokens({...tokens, youtube: oauthTokens});
  console.log("YouTube authorization saved!\n");

  return oauth2;
}
