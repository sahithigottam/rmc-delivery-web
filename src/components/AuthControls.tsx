"use client";

import { OrganizationSwitcher, SignInButton, SignUpButton, SignedIn, SignedOut, UserButton } from "@clerk/nextjs";

/** Sign-in / sign-up when signed out, profile menu when signed in — sized for the primary header */
export default function AuthControls() {
  return (
    <div className="flex items-center gap-2">
      <SignedOut>
        <SignInButton mode="modal">
          <button className="min-h-9 px-3 rounded-lg text-sm font-medium text-on-primary hover:bg-on-primary/10 transition-colors">
            Sign in
          </button>
        </SignInButton>
        <SignUpButton mode="modal">
          <button className="min-h-9 px-3 rounded-lg text-sm font-semibold bg-on-primary text-primary hover:opacity-90 transition-opacity">
            Sign up
          </button>
        </SignUpButton>
      </SignedOut>
      <SignedIn>
        <OrganizationSwitcher
          hidePersonal
          organizationProfileMode="modal"
          appearance={{
            elements: {
              organizationSwitcherTrigger: "text-on-primary hover:bg-on-primary/10 rounded-lg",
              organizationPreviewTextContainer: "hidden sm:block max-w-32 truncate",
              organizationSwitcherTriggerIcon: "text-on-primary",
              organizationSwitcherPopoverActionButton__createOrganization: { display: "none" },
            },
          }}
        />
        <UserButton appearance={{ elements: { avatarBox: "w-8 h-8" } }} />
      </SignedIn>
    </div>
  );
}
