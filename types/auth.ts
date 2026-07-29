export interface AuthActionState {
  status: "idle" | "error" | "success";
  message?: string;
  redirectTo?: string;
  fieldErrors?: Record<string, string[] | undefined>;
}

export const INITIAL_AUTH_STATE: AuthActionState = { status: "idle" };
