import { getUserId } from "@/lib/auth-session";
import { getUserDashboardData } from "@/lib/n8n-data";

export async function GET() {
  const userId = await getUserId();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const data = await getUserDashboardData(userId);
    return Response.json(data);
  } catch {
    return Response.json(
      { error: "Failed to fetch dashboard data" },
      { status: 500 }
    );
  }
}
