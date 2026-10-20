"use client";

import { useRouter } from "next/navigation";
import { AGE_COOKIE } from "@/lib/age-cookie";

export default function AgeGate({ siteName }: { siteName: string }) {
  const router = useRouter();
  return (
    <div className="sf-gate">
      <div>
        <h1>{siteName}</h1>
        <p>This site contains content intended for adults only. You must be 18 or older (or the age of majority where you live) to enter.</p>
        <p style={{ display: "flex", gap: ".6rem", justifyContent: "center" }}>
          <button
            className="sf-btn"
            onClick={() => {
              // host-scoped cookie (no Domain attribute): consent is per site
              document.cookie = `${AGE_COOKIE}=1; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`;
              router.refresh();
            }}
          >
            I am 18 or older. Enter
          </button>
          <a className="sf-btn" style={{ background: "#555" }} href="https://www.google.com">
            Leave
          </a>
        </p>
      </div>
    </div>
  );
}
