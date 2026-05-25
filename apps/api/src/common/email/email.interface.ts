export interface EmailService {
  sendVerificationEmail(
    to: string,
    token: string,
    tenantName: string,
  ): Promise<void>;
}
