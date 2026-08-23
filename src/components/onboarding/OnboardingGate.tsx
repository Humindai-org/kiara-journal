"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAccountStore } from "@/store/account";
import OnboardingWizard from "./OnboardingWizard";

/**
 * Mounted once inside the authenticated app layout. If the signed-in user
 * has zero accounts, it blocks the app behind the full-screen onboarding
 * wizard until one is created.
 */
export default function OnboardingGate() {
  const { accounts, setAccounts } = useAccountStore();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    supabase
      .from("accounts")
      .select("*")
      .order("created_at")
      .then(({ data }) => {
        if (cancelled) return;
        if (data) setAccounts(data);
        setChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, [setAccounts]);

  if (!checked || accounts.length > 0) return null;

  return <OnboardingWizard mode="first-run" onComplete={() => {}} />;
}
