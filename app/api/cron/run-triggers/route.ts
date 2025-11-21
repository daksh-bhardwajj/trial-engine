import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { Resend } from "resend";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerSupabaseClient();
  const resend = new Resend(process.env.RESEND_API_KEY);

  console.log("CRON: run-triggers called");

  const { data: triggers, error: triggersError } = await supabase
    .from("triggers")
    .select("*")
    .eq("active", true);

  if (triggersError) {
    console.error("CRON: error fetching triggers", triggersError);
    return NextResponse.json({ error: "trigger_error" }, { status: 500 });
  }

  if (!triggers || triggers.length === 0) {
    console.log("CRON: no active triggers");
    return NextResponse.json({ ok: true, msg: "no active triggers" });
  }

  console.log(`CRON: found ${triggers.length} active triggers`);

  let totalMatches = 0;
  let totalSent = 0;

  for (const trigger of triggers) {
    if (trigger.type !== "no_return_after_signup") continue;

    const hours = (trigger.params?.hours as number) ?? 24;
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    console.log(
      `CRON: processing trigger ${trigger.id} for project ${trigger.project_id}, hours=${hours}, cutoff=${cutoff}`
    );

    // Users whose first_seen_at is older than cutoff
    // AND last_seen_at == first_seen_at (never came back)
    const { data: users, error: usersError } = await supabase
      .from("trial_users")
      .select("*")
      .eq("project_id", trigger.project_id)
      .lte("first_seen_at", cutoff)
      .filter("last_seen_at", "eq", "first_seen_at"); // simple equality comparison

    if (usersError) {
      console.error("CRON: error fetching users", usersError);
      continue;
    }

    if (!users || users.length === 0) {
      console.log(`CRON: no matching users for trigger ${trigger.id}`);
      continue;
    }

    console.log(
      `CRON: trigger ${trigger.id} matched ${users.length} trial users`
    );
    totalMatches += users.length;

    for (const user of users) {
      if (!user.email) {
        console.log(
          `CRON: user ${user.id} has no email, skipping email send`
        );
        continue;
      }

      // check if a nudge already exists
      const { data: existingNudge, error: nudgeError } = await supabase
        .from("nudges")
        .select("*")
        .eq("trigger_id", trigger.id)
        .eq("trial_user_id", user.id)
        .maybeSingle();

      if (nudgeError) {
        console.error("CRON: error checking nudge", nudgeError);
        continue;
      }

      if (existingNudge) {
        console.log(
          `CRON: nudge already exists for user ${user.id}, trigger ${trigger.id}`
        );
        continue;
      }

      // create nudge row
      const { data: insertedNudge, error: insertError } = await supabase
        .from("nudges")
        .insert({
          project_id: trigger.project_id,
          trigger_id: trigger.id,
          trial_user_id: user.id,
          scheduled_for: new Date().toISOString(),
          status: "pending",
        })
        .select()
        .single();

      if (insertError || !insertedNudge) {
        console.error("CRON: error inserting nudge", insertError);
        continue;
      }

      try {
        await resend.emails.send({
          from: "Trial Engine <noreply@trialengine.dev>",
          to: user.email,
          subject: trigger.email_subject,
          html: trigger.email_body,
        });

        await supabase
          .from("nudges")
          .update({
            status: "sent",
            sent_at: new Date().toISOString(),
          })
          .eq("id", insertedNudge.id);

        console.log(
          `CRON: sent email to ${user.email} for trigger ${trigger.id}`
        );
        totalSent += 1;
      } catch (err) {
        console.error("CRON: email send failed", err);
        await supabase
          .from("nudges")
          .update({
            status: "failed",
            last_error: String(err),
          })
          .eq("id", insertedNudge.id);
      }
    }
  }

  console.log(
    `CRON: finished. totalMatches=${totalMatches}, totalSent=${totalSent}`
  );

  return NextResponse.json({ ok: true, totalMatches, totalSent });
}
