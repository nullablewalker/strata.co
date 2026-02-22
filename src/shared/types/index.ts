/**
 * Shared types used by both the React client and Hono API server.
 *
 * These types define the API contract between client and server. Changes here
 * affect both sides, ensuring type safety across the full stack without
 * duplicating definitions.
 */

/**
 * Application-level user, derived from Spotify profile data at OAuth time.
 * Fields are nullable because Spotify profiles don't guarantee all fields
 * (e.g., email requires the "user-read-email" scope and can still be absent).
 */
export interface User {
  id: string;
  spotifyId: string;
  displayName: string | null;
  email: string | null;
  avatarUrl: string | null;
}

/** Envelope for successful API responses — keeps a consistent shape for the client fetch wrapper. */
export interface ApiResponse<T> {
  data: T;
}

/** Envelope for error API responses — matches the success envelope convention. */
export interface ApiError {
  error: string;
}

/**
 * Client-side auth state returned by /api/auth/me.
 * `user` is null when the session cookie is missing or expired.
 */
export interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
}
