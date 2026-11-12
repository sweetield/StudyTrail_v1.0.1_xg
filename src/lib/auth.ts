import useSWR, { mutate } from "swr";
import { api, fetcher } from "./api";
import type { Me } from "./types";

export function useMe() {
  const { data, isLoading, mutate: refresh } = useSWR<{ user: Me | null }>("/api/auth/me", fetcher, {
    revalidateOnFocus: false,
  });
  return { user: data?.user ?? null, isLoading, refresh };
}

export async function logout() {
  await api.post("/api/auth/logout");
  await mutate(() => true, undefined, { revalidate: false });
  await mutate("/api/auth/me", { user: null }, { revalidate: false });
}
