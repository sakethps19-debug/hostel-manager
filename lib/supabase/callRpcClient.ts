"use client";

import { createClient } from "./client";

export async function callRpcClient<T>(
  name: string,
  params: object = {}
): Promise<T> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc(name, params);

  if (error) {
    throw new Error(error.message);
  }

  return data as T;
}
