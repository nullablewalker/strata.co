import { expectTypeOf } from "vitest";
import type { User, ApiResponse, ApiError, AuthState } from "./index";

describe("User type", () => {
  it("has correct property types", () => {
    expectTypeOf<User>().toHaveProperty("id").toBeString();
    expectTypeOf<User>().toHaveProperty("spotifyId").toBeString();
    expectTypeOf<User>()
      .toHaveProperty("displayName")
      .toEqualTypeOf<string | null>();
    expectTypeOf<User>()
      .toHaveProperty("email")
      .toEqualTypeOf<string | null>();
    expectTypeOf<User>()
      .toHaveProperty("avatarUrl")
      .toEqualTypeOf<string | null>();
  });

  it("has exactly the expected keys", () => {
    expectTypeOf<User>().toMatchTypeOf<{
      id: string;
      spotifyId: string;
      displayName: string | null;
      email: string | null;
      avatarUrl: string | null;
    }>();
  });
});

describe("ApiResponse<T> type", () => {
  it("wraps data with the given type parameter", () => {
    expectTypeOf<ApiResponse<string>>()
      .toHaveProperty("data")
      .toBeString();
    expectTypeOf<ApiResponse<number>>()
      .toHaveProperty("data")
      .toBeNumber();
    expectTypeOf<ApiResponse<User>>()
      .toHaveProperty("data")
      .toEqualTypeOf<User>();
  });

  it("wraps array types correctly", () => {
    expectTypeOf<ApiResponse<User[]>>()
      .toHaveProperty("data")
      .toEqualTypeOf<User[]>();
  });
});

describe("ApiError type", () => {
  it("has an error string property", () => {
    expectTypeOf<ApiError>().toHaveProperty("error").toBeString();
  });
});

describe("AuthState type", () => {
  it("has isAuthenticated boolean", () => {
    expectTypeOf<AuthState>().toHaveProperty("isAuthenticated").toBeBoolean();
  });

  it("has user as User or null", () => {
    expectTypeOf<AuthState>()
      .toHaveProperty("user")
      .toEqualTypeOf<User | null>();
  });

  it("matches the expected shape", () => {
    expectTypeOf<AuthState>().toMatchTypeOf<{
      isAuthenticated: boolean;
      user: User | null;
    }>();
  });
});
