// In cloud mode every member's jobs run under the team's one Composio key, so the key alone cannot say
// whose OneDrive or Google Drive a connected account is. The worker records the member a job runs for;
// a member may use only an account connected under their own id, and the workspace owner any of them.

let member: { userId: string; role: string } | null = null;

export function setCloudMember(m: { userId: string; role: string } | null): void {
  member = m;
}

/** Whether the account connected under this Composio user id may be used by the person the job runs for. */
export function accountAllowed(owner: string): boolean {
  if (!member) return true; // the server's own mode: one person, their own key
  return member.role === "owner" || owner === member.userId;
}

export function cloudMember(): { userId: string; role: string } | null {
  return member;
}
