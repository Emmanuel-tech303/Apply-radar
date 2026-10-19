import { z } from "zod";

export const InboundEmailSchema = z.object({
  recipientAlias: z.string().email().max(254),
  sender: z.string().email().max(254),
  subject: z.string().max(998).optional().default(""),
  body: z.string().max(100_000).optional().default(""),
});

export const ForwardingVerificationSchema = z.object({
  recipientAlias: z.string().email().max(254),
  sender: z.string().email().max(254).optional(),
  verificationCode: z.string().regex(/^\d{9}$/).optional(),
  verificationLink: z.string().url().max(4_000).optional(),
}).refine((payload) => payload.verificationCode || payload.verificationLink, {
  message: "A verification code or link is required.",
});

export const QuickApplicationSchema = z.object({
  companyName: z.string().trim().min(1).max(100),
  jobRole: z.string().trim().min(1).max(120),
  notes: z.string().trim().max(1_500).optional(),
});

export const SignInSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

export const SignUpSchema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(100, "Keep your name under 100 characters."),
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(8, "Use at least 8 characters for your password.").max(128, "Password must be 128 characters or fewer."),
});
