import { NextRequest, NextResponse } from "next/server";
import { requireTeamMemberOrSystemAdmin } from "@/lib/auth/guards";
import { getJobDetails } from "@/lib/services/job-service";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireTeamMemberOrSystemAdmin();
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { user, team } = authResult;
  const { id } = await params;
  const details = await getJobDetails(id);

  if (!details) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Job not found." } },
      { status: 404 }
    );
  }

  if (
    user.systemRole !== "system_admin" &&
    details.job.teamId !== team?.teamId
  ) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Job not found." } },
      { status: 404 }
    );
  }

  return NextResponse.json({
    ...details.job,
    attempts: details.attempts,
  });
}
