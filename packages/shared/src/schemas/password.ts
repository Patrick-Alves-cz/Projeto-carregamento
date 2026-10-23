import { z } from "zod";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_POLICY_MESSAGE,
  isPasswordStrong,
} from "../password-policy";

export const strongPasswordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, PASSWORD_POLICY_MESSAGE)
  .max(PASSWORD_MAX_LENGTH, PASSWORD_POLICY_MESSAGE)
  .refine(isPasswordStrong, { message: PASSWORD_POLICY_MESSAGE });
