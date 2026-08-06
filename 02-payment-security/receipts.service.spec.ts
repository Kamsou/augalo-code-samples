import { BadRequestException } from '@nestjs/common';
import { ReceiptsService } from './receipts.service';

type Stub<K extends string> = Record<K, jest.Mock>;

type IapStub = Stub<
  'validateApple' | 'validateGoogle' | 'resolveGoogleProductId'
> & { enforced: boolean };

type TransactionInput = {
  transactionId?: string;
  purchaseId?: string;
  platform?: string;
  purchaseDate?: string;
  productId?: string;
  price?: number;
};

type UserUpdate = { isPremium?: boolean; hasClubhouseAccess?: boolean };

describe('ReceiptsService : validation paiement web (D.3)', () => {
  let service: ReceiptsService;

  let receiptModel: Stub<'findOne' | 'create'>;
  let userModel: Stub<'findById' | 'findByIdAndUpdate'>;
  let packModel: Stub<'findOne' | 'findById'>;
  let subscriptionModel: Stub<'find' | 'findOne' | 'create'>;
  let classModel: Stub<'findById'>;
  let emailService: Stub<'sendEmail'>;
  let sendinblueService: Stub<'updateContactPremium'>;
  let stripeService: Stub<'getCheckoutSession'>;
  let iapService: IapStub;

  const createReceipt = (input: {
    userId: string;
    transaction: TransactionInput;
  }) => service.create(input as Parameters<ReceiptsService['create']>[0]);

  const wroteToUser = (predicate: (update: UserUpdate) => boolean): boolean =>
    userModel.findByIdAndUpdate.mock.calls.some((call: unknown[]) =>
      predicate((call[1] ?? {}) as UserUpdate),
    );

  const PREMIUM_PRODUCT_ID = 'com.ionic.augalo.com.premium.2026';
  const CLUBHOUSE_WEB_ID = 'com.ionic.augalo.com.clubhouse';
  const CLUBHOUSE_IOS_ID = 'com.augalo.themes_quiz_unlock';

  const webTransaction = (
    overrides: TransactionInput = {},
  ): TransactionInput => ({
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
      ...([
        receiptModel,
        userModel,
        packModel,
        subscriptionModel,
        classModel,
        emailService,
        sendinblueService,
        stripeService,
        iapService,
      ] as unknown as ConstructorParameters<typeof ReceiptsService>),
    );
  });

  describe('rejette sans jamais accorder premium quand', () => {
    it("la session web n'est pas payée", async () => {
      stripeService.getCheckoutSession.mockResolvedValue({
        payment_status: 'unpaid',
        metadata: { productId: PREMIUM_PRODUCT_ID },
      });

      await expect(
        createReceipt({
          userId: 'user_1',
          transaction: webTransaction(),
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(receiptModel.create).not.toHaveBeenCalled();
      expect(userModel.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it('la session web est introuvable (id falsifié)', async () => {
      stripeService.getCheckoutSession.mockRejectedValue(
        new Error('No such checkout.session'),
      );

      await expect(
        createReceipt({
          userId: 'user_1',
          transaction: webTransaction(),
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(receiptModel.create).not.toHaveBeenCalled();
      expect(userModel.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it('le purchaseId (session id) est absent', async () => {
      await expect(
        createReceipt({
          userId: 'user_1',
          transaction: webTransaction({ purchaseId: undefined }),
        }),
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
        createReceipt({
          userId: 'user_1',
          transaction: webTransaction(),
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(receiptModel.create).not.toHaveBeenCalled();
      expect(userModel.findByIdAndUpdate).not.toHaveBeenCalled();
    });
  });

  describe('plateforme non reconnue', () => {
    it('refuse une transaction vide sans jamais accorder premium', async () => {
      await expect(
        createReceipt({ userId: 'user_1', transaction: {} }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(receiptModel.create).not.toHaveBeenCalled();
      expect(userModel.findByIdAndUpdate).not.toHaveBeenCalled();
      expect(subscriptionModel.create).not.toHaveBeenCalled();
    });

    it('refuse une plateforme inconnue', async () => {
      await expect(
        createReceipt({
          userId: 'user_1',
          transaction: {
            transactionId: 'x',
            purchaseId: 'y',
            platform: 'windows-store-transaction',
            purchaseDate: new Date().toISOString(),
          },
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(receiptModel.create).not.toHaveBeenCalled();
      expect(userModel.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it('accepte les plateformes des builds en circulation', async () => {
      for (const platform of ['ios-appstore', 'android-playstore']) {
        jest.clearAllMocks();
        await expect(
          createReceipt({
            userId: 'user_1',
            transaction: {
              transactionId: `tx_${platform}`,
              purchaseId: `tok_${platform}`,
              platform,
              purchaseDate: new Date().toISOString(),
              productId: CLUBHOUSE_IOS_ID,
            },
          }),
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
      createReceipt({
        userId: 'user_1',
        transaction: webTransaction({ productId: CLUBHOUSE_WEB_ID }),
      }),
    ).resolves.toBeDefined();

    expect(stripeService.getCheckoutSession).toHaveBeenCalledWith(
      'cs_test_123',
    );
    expect(receiptModel.create).toHaveBeenCalled();
  });

  it('ne valide PAS via Stripe pour un achat mobile (IAP) : rétrocompat', async () => {
    await expect(
      createReceipt({
        userId: 'user_1',
        transaction: {
          transactionId: 'GPA.1234',
          purchaseId: 'token_abc',
          platform: 'ios',
          purchaseDate: new Date().toISOString(),
          productId: CLUBHOUSE_IOS_ID,
        },
      }),
    ).resolves.toBeDefined();

    expect(stripeService.getCheckoutSession).not.toHaveBeenCalled();
    expect(receiptModel.create).toHaveBeenCalled();
  });

  describe('IAP enforce (D.3-mobile)', () => {
    const iosTx = (overrides: TransactionInput = {}): TransactionInput => ({
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
        createReceipt({ userId: 'user_1', transaction: iosTx() }),
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
        createReceipt({ userId: 'user_1', transaction: iosTx() }),
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
        createReceipt({ userId: 'user_1', transaction: iosTx() }),
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
        createReceipt({
          userId: 'user_1',
          transaction: iosTx({
            platform: 'android-playstore',
            productId: 'club_house_unlock',
          }),
        }),
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

      await createReceipt({
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

      expect(wroteToUser((update) => update.isPremium === true)).toBe(false);
    });
  });

  describe('Builds sans productId (reconstitution serveur)', () => {
    const legacyTx = (overrides: TransactionInput = {}): TransactionInput => ({
      transactionId: 'legacy_tx_1',
      purchaseId: 'legacy_tok_1',
      platform: 'ios-appstore',
      purchaseDate: new Date().toISOString(),
      price: 499,
      ...overrides,
    });

    const grantedClubhouse = (): boolean =>
      wroteToUser((update) => update.hasClubhouseAccess === true);
    const grantedPremium = (): boolean =>
      wroteToUser((update) => update.isPremium === true);

    it('iOS : reconstitue le productId depuis Apple et accorde le seul Club House', async () => {
      iapService.validateApple.mockResolvedValue({
        configured: true,
        verdict: 'valid',
        detail: 'paid',
        productId: CLUBHOUSE_IOS_ID,
      });

      await createReceipt({
        userId: 'user_1',
        transaction: legacyTx(),
      });

      expect(grantedClubhouse()).toBe(true);
      expect(grantedPremium()).toBe(false);
      expect(subscriptionModel.create).not.toHaveBeenCalled();
    });

    it('iOS : persiste le productId reconstitué sur le reçu', async () => {
      iapService.validateApple.mockResolvedValue({
        configured: true,
        verdict: 'valid',
        detail: 'paid',
        productId: CLUBHOUSE_IOS_ID,
      });

      await createReceipt({
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

    it('Android : le productId est résolu contre le store, pas déduit du prix', async () => {
      iapService.resolveGoogleProductId.mockResolvedValue('club_house_unlock');
      iapService.validateGoogle.mockResolvedValue({
        configured: true,
        verdict: 'valid',
        detail: 'purchaseState=0',
      });

      await createReceipt({
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

    it('Android : un prix 499 seul ne suffit PAS à accorder le Club House', async () => {
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

      await createReceipt({
        userId: 'user_1',
        transaction: legacyTx({ platform: 'android-playstore', price: 499 }),
      });

      expect(grantedClubhouse()).toBe(false);
    });

    it('Web : le productId de la session Stripe fait autorité', async () => {
      stripeService.getCheckoutSession.mockResolvedValue({
        payment_status: 'paid',
        metadata: { productId: CLUBHOUSE_WEB_ID },
      });

      await createReceipt({
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

      await createReceipt({
        userId: 'user_1',
        transaction: legacyTx({ platform: 'android-playstore', price: 2999 }),
      });

      expect(grantedClubhouse()).toBe(false);
      expect(subscriptionModel.create).toHaveBeenCalled();
    });

    it('sans productId ni prix exploitable, conserve le repli par année', async () => {
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

      await createReceipt({
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
