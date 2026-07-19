export interface AuthActionState {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
}

export const INITIAL_AUTH_STATE: AuthActionState = { status: "idle" };
