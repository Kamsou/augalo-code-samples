/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment */
import { BadRequestException } from '@nestjs/common';
import { ReceiptsService } from './receipts.service';

/**
 * Filet anti-régression pour le durcissement D.3 (validation paiement web).
 * Propriété de sécurité : un POST /receipts avec une transaction web non payée
 * ou falsifiée ne doit JAMAIS créer de reçu ni accorder l'accès premium.
 * Les achats mobiles (IAP) ne passent pas par la validation Stripe (rétrocompat).
 */
describe('ReceiptsService — validation paiement web (D.3)', () => {
  let service: ReceiptsService;

  let receiptModel: any;
  let userModel: any;
  let packModel: any;
  let subscriptionModel: any;
  let classModel: any;
  let emailService: any;
  let sendinblueService: any;
  let stripeService: any;
  let iapService: any;

  const PREMIUM_PRODUCT_ID = 'com.ionic.augalo.com.premium.2026';
  const CLUBHOUSE_WEB_ID = 'com.ionic.augalo.com.clubhouse';
  const CLUBHOUSE_IOS_ID = 'com.augalo.themes_quiz_unlock';

  const webTransaction = (overrides: Record<string, any> = {}) => ({
    transactionId: 'pi_test_123',
    purchaseId: 'cs_test_123',
    platform: 'web',
    purchaseDate: new Date().toISOString(),
    productId: PREMIUM_PRODUCT_ID,
    ...overrides,
  });

  beforeEach(() => {
    receiptModel = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ _id: 'receipt_1' }),
    };
    userModel = {
      findById: jest.fn().mockResolvedValue({
        _id: 'user_1',
        email: 'rider@augalo.com',
        name: 'Rider',
      }),
      findByIdAndUpdate: jest.fn().mockResolvedValue({}),
    };
    packModel = { findOne: jest.fn(), findById: jest.fn() };
    subscriptionModel = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ _id: 'sub_1', packs: ['pack_1'] }),
    };
    classModel = { findById: jest.fn() };
    emailService = { sendEmail: jest.fn().mockResolvedValue(undefined) };
    sendinblueService = {
      updateContactPremium: jest.fn().mockResolvedValue(undefined),
    };
    stripeService = { getCheckoutSession: jest.fn() };
    iapService = {
      enforced: true,
      validateApple: jest.fn().mockResolvedValue({
        configured: true,
        verdict: 'valid',
        detail: 'test',
      }),
      validateGoogle: jest.fn().mockResolvedValue({
        configured: true,
        verdict: 'valid',
        detail: 'test',
      }),
      resolveGoogleProductId: jest.fn().mockResolvedValue(null),
    };

    service = new ReceiptsService(
      receiptModel,
      userModel,
      packModel,
      subscriptionModel,
      classModel,
      emailService,
      sendinblueService,
      stripeService,
      iapService,
    );
  });

  describe('rejette sans jamais accorder premium quand', () => {
    it("la session web n'est pas payée", async () => {
      stripeService.getCheckoutSession.mockResolvedValue({
        payment_status: 'unpaid',
        metadata: { productId: PREMIUM_PRODUCT_ID },
      });

      await expect(
        service.create({
          userId: 'user_1',
          transaction: webTransaction(),
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(receiptModel.create).not.toHaveBeenCalled();
      expect(userModel.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it('la session web est introuvable (id falsifié)', async () => {
      stripeService.getCheckoutSession.mockRejectedValue(
        new Error('No such checkout.session'),
      );

      await expect(
        service.create({
          userId: 'user_1',
          transaction: webTransaction(),
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(receiptModel.create).not.toHaveBeenCalled();
      expect(userModel.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it('le purchaseId (session id) est absent', async () => {
      await expect(
        service.create({
          userId: 'user_1',
          transaction: webTransaction({ purchaseId: undefined }),
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(stripeService.getCheckoutSession).not.toHaveBeenCalled();
      expect(receiptModel.create).not.toHaveBeenCalled();
    });

    it('le productId réclamé ne correspond pas à la session payée', async () => {
      stripeService.getCheckoutSession.mockResolvedValue({
        payment_status: 'paid',
        metadata: { productId: 'com.ionic.augalo.com.premium.2025' },
      });

      await expect(
        service.create({
          userId: 'user_1',
          transaction: webTransaction(),
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(receiptModel.create).not.toHaveBeenCalled();
      expect(userModel.findByIdAndUpdate).not.toHaveBeenCalled();
    });
  });

  describe('plateforme non reconnue', () => {
    it('refuse une transaction vide sans jamais accorder premium', async () => {
      await expect(
        service.create({ userId: 'user_1', transaction: {} } as any),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(receiptModel.create).not.toHaveBeenCalled();
      expect(userModel.findByIdAndUpdate).not.toHaveBeenCalled();
      expect(subscriptionModel.create).not.toHaveBeenCalled();
    });

    it('refuse une plateforme inconnue', async () => {
      await expect(
        service.create({
          userId: 'user_1',
          transaction: {
            transactionId: 'x',
            purchaseId: 'y',
            platform: 'windows-store-transaction',
            purchaseDate: new Date().toISOString(),
          },
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(receiptModel.create).not.toHaveBeenCalled();
      expect(userModel.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it('accepte les plateformes des builds en circulation', async () => {
      for (const platform of ['ios-appstore', 'android-playstore']) {
        jest.clearAllMocks();
        await expect(
          service.create({
            userId: 'user_1',
            transaction: {
              transactionId: `tx_${platform}`,
              purchaseId: `tok_${platform}`,
              platform,
              purchaseDate: new Date().toISOString(),
              productId: CLUBHOUSE_IOS_ID,
            },
          } as any),
        ).resolves.toBeDefined();
      }
    });
  });

  it('accepte un achat web dont la session est réellement payée', async () => {
    stripeService.getCheckoutSession.mockResolvedValue({
      payment_status: 'paid',
      metadata: { productId: CLUBHOUSE_WEB_ID },
    });

    await expect(
      service.create({
        userId: 'user_1',
        transaction: webTransaction({ productId: CLUBHOUSE_WEB_ID }),
      } as any),
    ).resolves.toBeDefined();

    expect(stripeService.getCheckoutSession).toHaveBeenCalledWith(
      'cs_test_123',
    );
    expect(receiptModel.create).toHaveBeenCalled();
  });

  it('ne valide PAS via Stripe pour un achat mobile (IAP) — rétrocompat', async () => {
    await expect(
      service.create({
        userId: 'user_1',
        transaction: {
          transactionId: 'GPA.1234',
          purchaseId: 'token_abc',
          platform: 'ios',
          purchaseDate: new Date().toISOString(),
          productId: CLUBHOUSE_IOS_ID,
        },
      } as any),
    ).resolves.toBeDefined();

    expect(stripeService.getCheckoutSession).not.toHaveBeenCalled();
    expect(receiptModel.create).toHaveBeenCalled();
  });

  describe('IAP enforce (D.3-mobile)', () => {
    const iosTx = (overrides: Record<string, any> = {}) => ({
      transactionId: 'apple_tx_123',
      purchaseId: 'apple_tok_123',
      platform: 'ios-appstore',
      purchaseDate: new Date().toISOString(),
      productId: CLUBHOUSE_IOS_ID,
      ...overrides,
    });

    it('rejette un reçu iOS confirmé invalide quand enforce actif', async () => {
      iapService.enforced = true;
      iapService.validateApple.mockResolvedValue({
        configured: true,
        verdict: 'invalid',
        detail: 'transaction introuvable',
      });

      await expect(
        service.create({ userId: 'user_1', transaction: iosTx() } as any),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(receiptModel.create).not.toHaveBeenCalled();
      expect(userModel.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it('accepte un reçu iOS invalide quand enforce désactivé (kill switch)', async () => {
      iapService.enforced = false;
      iapService.validateApple.mockResolvedValue({
        configured: true,
        verdict: 'invalid',
        detail: 'x',
      });

      await expect(
        service.create({ userId: 'user_1', transaction: iosTx() } as any),
      ).resolves.toBeDefined();

      expect(receiptModel.create).toHaveBeenCalled();
    });

    it('accepte (grace) un verdict unknown même en enforce', async () => {
      iapService.enforced = true;
      iapService.validateApple.mockResolvedValue({
        configured: true,
        verdict: 'unknown',
        detail: 'apple HTTP 500',
      });

      await expect(
        service.create({ userId: 'user_1', transaction: iosTx() } as any),
      ).resolves.toBeDefined();

      expect(receiptModel.create).toHaveBeenCalled();
    });

    it('rejette un reçu Android confirmé invalide quand enforce actif', async () => {
      iapService.enforced = true;
      iapService.validateGoogle.mockResolvedValue({
        configured: true,
        verdict: 'invalid',
        detail: 'purchaseState=1',
      });

      await expect(
        service.create({
          userId: 'user_1',
          transaction: iosTx({
            platform: 'android-playstore',
            productId: 'club_house_unlock',
          }),
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(receiptModel.create).not.toHaveBeenCalled();
    });
  });

  describe('Achat palier (paliers)', () => {
    it('crée une subscription ANNUAL_TIER sans poser isPremium global', async () => {
      const palierPack = {
        _id: 'pack_g34',
        name: 'Pack Galops 3-4 2026-2027',
        endDate: new Date('2027-08-31'),
        gallops: [3, 4],
      };
      packModel.findOne.mockResolvedValue(palierPack);
      subscriptionModel.findOne.mockResolvedValue(null);
      subscriptionModel.create.mockResolvedValue({
        _id: 'sub_pal',
        packs: ['pack_g34'],
        type: 'annual_tier',
      });

      await service.create({
        userId: 'user_1',
        transaction: {
          transactionId: 'apple_tx_g34',
          purchaseId: 'apple_tok_g34',
          platform: 'ios-appstore',
          purchaseDate: new Date().toISOString(),
          productId: 'com.ionic.augalo.com.premium.2026.g34',
        },
      });

      expect(subscriptionModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'annual_tier', packs: ['pack_g34'] }),
      );

      const setPremium = userModel.findByIdAndUpdate.mock.calls.some(
        (call: any) => call[1]?.isPremium === true,
      );
      expect(setPremium).toBe(false);
    });
  });

  describe('Builds sans productId (reconstitution serveur)', () => {
    const legacyTx = (overrides: Record<string, any> = {}) => ({
      transactionId: 'legacy_tx_1',
      purchaseId: 'legacy_tok_1',
      platform: 'ios-appstore',
      purchaseDate: new Date().toISOString(),
      price: 499,
      ...overrides,
    });

    const grantedClubhouse = (): boolean =>
      Boolean(
        userModel.findByIdAndUpdate.mock.calls.some(
          (call: any) => call[1]?.hasClubhouseAccess === true,
        ),
      );
    const grantedPremium = (): boolean =>
      Boolean(
        userModel.findByIdAndUpdate.mock.calls.some(
          (call: any) => call[1]?.isPremium === true,
        ),
      );

    it('iOS : reconstitue le productId depuis Apple et accorde le seul Club House', async () => {
      iapService.validateApple.mockResolvedValue({
        configured: true,
        verdict: 'valid',
        detail: 'paid',
        productId: CLUBHOUSE_IOS_ID,
      });

      await service.create({
        userId: 'user_1',
        transaction: legacyTx(),
      });

      expect(grantedClubhouse()).toBe(true);
      expect(grantedPremium()).toBe(false);
      expect(subscriptionModel.create).not.toHaveBeenCalled();
    });

    it('iOS : persiste le productId reconstitue sur le recu', async () => {
      iapService.validateApple.mockResolvedValue({
        configured: true,
        verdict: 'valid',
        detail: 'paid',
        productId: CLUBHOUSE_IOS_ID,
      });

      await service.create({
        userId: 'user_1',
        transaction: legacyTx(),
      });

      expect(receiptModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          transaction: expect.objectContaining({
            productId: CLUBHOUSE_IOS_ID,
          }),
        }),
      );
    });

    it('Android : le productId est resolu contre le store, pas deduit du prix', async () => {
      iapService.resolveGoogleProductId.mockResolvedValue('club_house_unlock');
      iapService.validateGoogle.mockResolvedValue({
        configured: true,
        verdict: 'valid',
        detail: 'purchaseState=0',
      });

      await service.create({
        userId: 'user_1',
        transaction: legacyTx({ platform: 'android-playstore' }),
      });

      expect(iapService.resolveGoogleProductId).toHaveBeenCalledWith(
        expect.arrayContaining(['club_house_unlock']),
        'legacy_tok_1',
      );
      expect(grantedClubhouse()).toBe(true);
      expect(grantedPremium()).toBe(false);
    });

    it('Android : un prix 499 seul ne suffit PAS a accorder le Club House', async () => {
      iapService.resolveGoogleProductId.mockResolvedValue(null);
      iapService.validateGoogle.mockResolvedValue({
        configured: true,
        verdict: 'unknown',
        detail: 'missing productId/purchaseToken',
      });
      packModel.findOne.mockResolvedValue({
        _id: 'pack_annuel',
        name: 'Pack Premium',
        endDate: new Date('2027-08-31'),
      });
      subscriptionModel.create.mockResolvedValue({
        _id: 'sub_annuel',
        packs: ['pack_annuel'],
        type: 'annual',
      });
      packModel.findById.mockResolvedValue({ name: 'Pack Premium' });

      await service.create({
        userId: 'user_1',
        transaction: legacyTx({ platform: 'android-playstore', price: 499 }),
      });

      expect(grantedClubhouse()).toBe(false);
    });

    it('Web : le productId de la session Stripe fait autorite', async () => {
      stripeService.getCheckoutSession.mockResolvedValue({
        payment_status: 'paid',
        metadata: { productId: CLUBHOUSE_WEB_ID },
      });

      await service.create({
        userId: 'user_1',
        transaction: {
          transactionId: 'pi_web_1',
          purchaseId: 'cs_web_1',
          platform: 'web',
          purchaseDate: new Date().toISOString(),
        },
      });

      expect(grantedClubhouse()).toBe(true);
      expect(grantedPremium()).toBe(false);
    });

    it('un achat pack legacy (2999) ne doit PAS passer pour du Club House', async () => {
      iapService.validateGoogle.mockResolvedValue({
        configured: true,
        verdict: 'valid',
        detail: 'purchaseState=0',
      });
      packModel.findOne.mockResolvedValue({
        _id: 'pack_annuel',
        name: 'Pack Premium',
        endDate: new Date('2027-08-31'),
      });
      subscriptionModel.create.mockResolvedValue({
        _id: 'sub_annuel',
        packs: ['pack_annuel'],
        type: 'annual',
      });
      packModel.findById.mockResolvedValue({ name: 'Pack Premium' });

      await service.create({
        userId: 'user_1',
        transaction: legacyTx({ platform: 'android-playstore', price: 2999 }),
      });

      expect(grantedClubhouse()).toBe(false);
      expect(subscriptionModel.create).toHaveBeenCalled();
    });

    it('sans productId ni prix exploitable, conserve le repli par annee', async () => {
      iapService.validateGoogle.mockResolvedValue({
        configured: true,
        verdict: 'unknown',
        detail: 'missing productId/purchaseToken',
      });
      packModel.findOne.mockResolvedValue({
        _id: 'pack_annuel',
        name: 'Pack Premium',
        endDate: new Date('2027-08-31'),
      });
      subscriptionModel.create.mockResolvedValue({
        _id: 'sub_annuel',
        packs: ['pack_annuel'],
        type: 'annual',
      });
      packModel.findById.mockResolvedValue({ name: 'Pack Premium' });

      await service.create({
        userId: 'user_1',
        transaction: legacyTx({
          platform: 'android-playstore',
          price: undefined,
        }),
      });

      expect(grantedClubhouse()).toBe(false);
      expect(subscriptionModel.create).toHaveBeenCalled();
    });
  });
});
