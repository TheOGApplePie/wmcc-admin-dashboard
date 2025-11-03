import z from "zod";
export interface LoginCredentials {
  email: string;
  password: string;
}
export const loginCredentials = z.object({
  email: z.email(),
  password: z.string().trim(),
});
