export interface User {
  id: string;
  spotifyId: string;
  displayName: string | null;
  email: string | null;
  avatarUrl: string | null;
}

export interface ApiResponse<T> {
  data: T;
}

export interface ApiError {
  error: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
}
