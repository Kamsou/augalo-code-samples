import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';

export type IapVerdict = 'valid' | 'invalid' | 'unknown';

export type IapValidationResult = {
  configured: boolean;
  verdict: IapVerdict;
  detail: string;
  productId?: string;
};

/**
 * Validation serveur des achats in-app (D.3-mobile).
 * - Apple : App Store Server API "Get Transaction Info" (auth JWT ES256).
 * - Google : Play Developer API "purchases.products.get" (service account, JWT RS256).
 *
 * Verdict : 'valid' = payé confirmé par le store ; 'invalid' = confirmé non-payé /
 * introuvable (reçu falsifié) ; 'unknown' = indéterminé (non configuré, réseau,
 * timeout, 5xx, permission…). En mode enforce, seul 'invalid' est rejeté — 'unknown'
 * est toujours toléré pour ne jamais bloquer un acheteur légitime sur un souci d'infra.
 * Aucun secret loggé, ne throw jamais.
 */
@Injectable()
export class IapService {
  private readonly logger = new Logger(IapService.name);

  readonly enforced: boolean;

  private readonly appleKey: string | null;
  private readonly appleKeyId: string;
  private readonly appleIssuerId: string;
  private readonly appleBundleId: string;

  private readonly googleClientEmail: string | null;
  private readonly googlePrivateKey: string | null;
  private readonly androidPackage: string;

  constructor(private readonly config: ConfigService) {
    this.enforced = this.config.get<string>('IAP_ENFORCE') !== 'false';

    this.appleKey = this.decodeBase64(
      this.config.get<string>('APPLE_IAP_KEY_BASE64'),
    );
    this.appleKeyId = this.config.get<string>('APPLE_IAP_KEY_ID') ?? '';
    this.appleIssuerId = this.config.get<string>('APPLE_IAP_ISSUER_ID') ?? '';
    this.appleBundleId = this.config.get<string>('APPLE_BUNDLE_ID') ?? '';

    let clientEmail: string | null = null;
    let privateKey: string | null = null;
    const saJson = this.decodeBase64(
      this.config.get<string>('GOOGLE_PLAY_SA_BASE64'),
    );
    if (saJson) {
      try {
        const parsed = JSON.parse(saJson) as {
          client_email?: string;
          private_key?: string;
        };
        clientEmail = parsed.client_email ?? null;
        privateKey = parsed.private_key ?? null;
      } catch {
        this.logger.warn('GOOGLE_PLAY_SA_BASE64 invalide (JSON non parsable)');
      }
    }
    this.googleClientEmail = clientEmail;
    this.googlePrivateKey = privateKey;
    this.androidPackage = this.config.get<string>('ANDROID_PACKAGE_NAME') ?? '';
  }

  private decodeBase64(value?: string): string | null {
    if (!value) return null;
    try {
      return Buffer.from(value, 'base64').toString('utf8');
    } catch {
      return null;
    }
  }

  private result(
    configured: boolean,
    verdict: IapVerdict,
    detail: string,
    productId?: string,
  ): IapValidationResult {
    return { configured, verdict, detail, productId };
  }

  // ---------------- Apple ----------------

  private appleAuthToken(): string {
    const now = Math.floor(Date.now() / 1000);
    return jwt.sign(
      {
        iss: this.appleIssuerId,
        iat: now,
        exp: now + 300,
        aud: 'appstoreconnect-v1',
        bid: this.appleBundleId,
      },
      this.appleKey as string,
      { algorithm: 'ES256', keyid: this.appleKeyId },
    );
  }

  async validateApple(transactionId?: string): Promise<IapValidationResult> {
    if (!this.appleKey || !this.appleKeyId || !this.appleIssuerId) {
      return this.result(false, 'unknown', 'apple not configured');
    }
    if (!transactionId) {
      return this.result(true, 'unknown', 'no transactionId');
    }

    let token: string;
    try {
      token = this.appleAuthToken();
    } catch (error) {
      return this.result(true, 'unknown', `auth jwt error: ${this.msg(error)}`);
    }

    const hosts = [
      { env: 'production', base: 'https://api.storekit.itunes.apple.com' },
      { env: 'sandbox', base: 'https://api.storekit-sandbox.itunes.apple.com' },
    ];

    for (const { env, base } of hosts) {
      try {
        const res = await fetch(
          `${base}/inApps/v1/transactions/${encodeURIComponent(transactionId)}`,
          {
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(8000),
          },
        );

        if (res.status === 200) {
          const body = (await res.json()) as { signedTransactionInfo?: string };
          const info = body.signedTransactionInfo
            ? (jwt.decode(body.signedTransactionInfo) as {
                productId?: string;
                type?: string;
              } | null)
            : null;
          return this.result(
            true,
            'valid',
            `paid (${env}) product=${info?.productId ?? '?'} type=${info?.type ?? '?'}`,
            info?.productId,
          );
        }
        if (res.status === 404) {
          continue;
        }
        return this.result(true, 'unknown', `${env} HTTP ${res.status}`);
      } catch (error) {
        return this.result(true, 'unknown', `${env} error: ${this.msg(error)}`);
      }
    }

    return this.result(
      true,
      'invalid',
      'transaction introuvable (prod+sandbox)',
    );
  }

  // ---------------- Google ----------------

  private async googleAccessToken(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const assertion = jwt.sign(
      {
        iss: this.googleClientEmail as string,
        scope: 'https://www.googleapis.com/auth/androidpublisher',
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600,
      },
      this.googlePrivateKey as string,
      { algorithm: 'RS256' },
    );

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      throw new Error(`token exchange HTTP ${res.status}`);
    }
    const data = (await res.json()) as { access_token?: string };
    if (!data.access_token) {
      throw new Error('no access_token');
    }
    return data.access_token;
  }

  async validateGoogle(
    productId?: string,
    purchaseToken?: string | null,
  ): Promise<IapValidationResult> {
    if (
      !this.googleClientEmail ||
      !this.googlePrivateKey ||
      !this.androidPackage
    ) {
      return this.result(false, 'unknown', 'google not configured');
    }
    if (!productId || !purchaseToken) {
      return this.result(true, 'unknown', 'missing productId/purchaseToken');
    }

    try {
      const accessToken = await this.googleAccessToken();
      const url =
        `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/` +
        `${encodeURIComponent(this.androidPackage)}/purchases/products/` +
        `${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(8000),
      });

      if (res.status === 200) {
        const body = (await res.json()) as { purchaseState?: number };
        // purchaseState : 0 = acheté, 1 = annulé, 2 = en attente
        const verdict: IapVerdict =
          body.purchaseState === 0 ? 'valid' : 'invalid';
        return this.result(
          true,
          verdict,
          `purchaseState=${body.purchaseState}`,
        );
      }
      // Token mal formé / inexistant → reçu falsifié. Erreurs infra/permission → grace.
      if (res.status === 400 || res.status === 404) {
        return this.result(true, 'invalid', `HTTP ${res.status}`);
      }
      return this.result(true, 'unknown', `HTTP ${res.status}`);
    } catch (error) {
      return this.result(true, 'unknown', `error: ${this.msg(error)}`);
    }
  }

  async resolveGoogleProductId(
    candidateIds: string[],
    purchaseToken?: string | null,
  ): Promise<string | null> {
    if (!purchaseToken) return null;

    for (const candidate of candidateIds) {
      const result = await this.validateGoogle(candidate, purchaseToken);
      if (result.verdict === 'valid') return candidate;
    }

    return null;
  }

  private msg(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
