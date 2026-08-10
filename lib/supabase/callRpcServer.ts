import { createClient } from "./server";

export async function callRpcServer<T>(
  name: string,
  params: object = {}
): Promise<T> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(name, params);

  if (error) {
    throw new Error(error.message);
  }

  return data as T;
}
