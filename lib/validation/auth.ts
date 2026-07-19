import { z } from "zod";

export const emailSchema = z.email("Informe um e-mail válido.").trim();

export const passwordSchema = z
  .string()
  .min(8, "A senha deve ter pelo menos 8 caracteres.")
  .regex(/[a-zA-Z]/, "Inclua pelo menos uma letra.")
  .regex(/[0-9]/, "Inclua pelo menos um número.");

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Informe sua senha."),
});

export const signupSchema = z
  .object({
    displayName: z
      .string()
      .trim()
      .min(2, "Informe um nome com pelo menos 2 caracteres.")
      .max(80),
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "As senhas não coincidem.",
    path: ["confirmPassword"],
  });

export const resetRequestSchema = z.object({ email: emailSchema });

export const updatePasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "As senhas não coincidem.",
    path: ["confirmPassword"],
  });
