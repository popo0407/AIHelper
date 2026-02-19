/**
 * AppSync GraphQL client utility.
 *
 * Provides a thin wrapper around Amplify v6's `generateClient()` so every
 * component can call `graphqlClient.graphql(...)` without duplicating setup.
 */

import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/api';
import awsConfig from '@/config/aws';

// ── Amplify initialisation (runs once on module load) ──
let _configured = false;

export function ensureAmplifyConfigured(): void {
  if (_configured) return;
  Amplify.configure(awsConfig as any, { ssr: true });
  _configured = true;
}

// ── GraphQL client ──

ensureAmplifyConfigured();
export const graphqlClient = generateClient();

// ── Helper types ──

export interface GraphQLResult<T> {
  data: T;
  errors?: Array<{ message: string }>;
}

/**
 * Type guard: checks the mutation response's `success` / `error` fields
 * that our Lambda resolvers follow.
 */
export interface MutationResponse<T> {
  success: boolean;
  error?: string | null;
  [key: string]: T | boolean | string | null | undefined;
}

/**
 * Extracts the first key holding the response payload from a GraphQL result.
 *
 * Usage:
 * ```ts
 * const result = await graphqlClient.graphql({ query: LIST_USERS });
 * const users = extractData<User[]>(result, 'listUsers');
 * ```
 */
export function extractData<T>(
  result: { data: Record<string, unknown>; errors?: Array<{ message: string }> },
  key: string
): T {
  // Check for GraphQL errors
  if (result.errors && result.errors.length > 0) {
    const errorMessages = result.errors.map(e => e.message).join(', ');
    throw new Error(`GraphQL Error: ${errorMessages}`);
  }

  return result.data[key] as T;
}
