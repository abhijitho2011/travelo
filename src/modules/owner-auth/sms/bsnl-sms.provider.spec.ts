import { BsnlSmsProvider } from './bsnl-sms.provider';
import { AppEnv } from '../../../config/env';

function mkEnv(overrides: Partial<AppEnv> = {}): AppEnv {
  return {
    BSNL_BASE_URL: 'https://sms.example.gov',
    BSNL_USERNAME: 'user',
    BSNL_PASSWORD: 'pass',
    BSNL_HEADER: 'TRAVLO',
    BSNL_ENTITY_ID: '110100001234567890',
    BSNL_TEMPLATE_ID: '150700004567890123',
    BSNL_TEMPLATE_VAR_KEY: 'motcode',
    BSNL_TOKEN_PATH: '/api/Create_New_API_Token',
    BSNL_SEND_PATH: '/api/Send_SMS',
    BSNL_INSECURE_TLS: false,
    ...overrides,
  } as unknown as AppEnv;
}

describe('BsnlSmsProvider.buildPayload', () => {
  it('produces the BSNL Send_SMS contract shape', () => {
    const provider = new BsnlSmsProvider(mkEnv());
    const payload = provider.buildPayload('9000000001', '123456') as Record<string, unknown>;
    expect(payload.Header).toBe('TRAVLO');
    expect(payload.Target).toBe('9000000001');
    expect(payload.Is_Unicode).toBe('0');
    expect(payload.Is_Flash).toBe('0');
    expect(payload.Message_Type).toBe('TXN');
    expect(payload.Entity_Id).toBe('110100001234567890');
    expect(payload.Content_Template_Id).toBe('150700004567890123');
    expect(payload.Template_Keys_and_Values).toEqual([{ Key: 'motcode', Value: '123456' }]);
  });

  it('includes Service_Id only when configured', () => {
    const without = new BsnlSmsProvider(mkEnv()).buildPayload('9000000001', '111111');
    expect(without).not.toHaveProperty('Service_Id');
    const withId = new BsnlSmsProvider(mkEnv({ BSNL_SERVICE_ID: '11313' } as never)).buildPayload(
      '9000000001',
      '111111',
    );
    expect((withId as Record<string, unknown>).Service_Id).toBe('11313');
  });

  it('builds the token body with all four required capitalized fields', () => {
    const provider = new BsnlSmsProvider(
      mkEnv({ BSNL_SERVICE_ID: '11313', BSNL_TOKEN_ID: '1' } as never),
    );
    expect(provider.buildTokenBody()).toEqual({
      Username: 'user',
      Password: 'pass',
      Service_Id: '11313',
      Token_Id: '1',
    });
  });

  it('maps the configured template variable key', () => {
    const provider = new BsnlSmsProvider(mkEnv({ BSNL_TEMPLATE_VAR_KEY: 'otp_value' } as never));
    const payload = provider.buildPayload('9000000002', '654321') as Record<string, unknown>;
    expect(payload.Template_Keys_and_Values).toEqual([{ Key: 'otp_value', Value: '654321' }]);
  });
});
