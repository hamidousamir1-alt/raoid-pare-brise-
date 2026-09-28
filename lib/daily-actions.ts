import { db } from "./db";

export async function generateDailyActions() {
  const setting =
    await db()`select enabled,numeric_value as "limit" from automation_settings where setting_key='daily_action_plan'`;
  if (setting.length && !setting[0].enabled)
    return { created: 0, paused: true, considered: 0 };
  const limit = Math.max(1, Math.min(30, Number(setting[0]?.limit) || 12));
  const candidates = await db()`
    select p.id,p.status,p.phone,p.email,p.score,p.company_size as "companySize",
      p.next_action_at as "nextActionAt",p.last_contact_at as "lastContactAt",
      case
        when p.next_action_at is not null and p.next_action_at<=now() then 30
        when p.status='Offre' then 22
        when p.status='RDV' then 20
        when p.status='Relance' then 18
        else 0
      end
      + least(45,greatest(0,p.score)*0.45)::int
      + case when p.company_size ~* 'TPE|PME' then 12 when p.company_size ~* 'ETI|Grande' then -8 else 2 end
      + case when p.phone is not null and p.phone<>'' then 5 else 0 end
      + case when p.email is not null and p.email<>'' then 4 else 0 end as priority
    from prospects p
    where p.deleted_at is null and p.do_not_contact=false
      and p.status not in ('Gagné','Perdu')
      and p.establishment_active is distinct from false
      and coalesce(p.duplicate_status,'Unique') not ilike '%doublon%'
      and (
        p.verification_status in ('Vérifiée','Probable')
        or exists(select 1 from prospect_events e where e.prospect_id=p.id and e.event_type in ('field_visit','call_logged','email_reply_classified','appointment_created'))
      )
      and not exists(select 1 from sales_tasks t where t.prospect_id=p.id and t.status='open')
      and not exists(select 1 from email_enrollments e where e.prospect_id=p.id and e.status='active')
      and not exists(select 1 from appointments a where a.prospect_id=p.id and a.status not in ('cancelled','completed','no_show') and a.starts_at::date=current_date)
      and not exists(select 1 from sales_tasks t where t.prospect_id=p.id and t.task_type='daily_plan' and t.generated_for_date=current_date)
      and (p.next_action_at<=now() or p.last_contact_at is null or p.last_contact_at<now()-interval '2 days')
    order by priority desc,p.next_action_at asc nulls last,p.updated_at asc
    limit ${limit}`;
  let created = 0;
  for (const prospect of candidates as any[]) {
    const channel = prospect.phone
        ? "Téléphone"
        : prospect.email
          ? "E-mail"
          : "Visite terrain",
      title =
        prospect.status === "Offre"
          ? "Relancer l’offre et lever les derniers freins"
          : prospect.status === "RDV"
            ? "Préparer et confirmer le rendez-vous"
            : prospect.status === "Relance"
              ? `Effectuer la relance par ${channel.toLowerCase()}`
              : channel === "Visite terrain"
                ? "Qualifier l’entreprise lors d’un passage terrain"
                : `Qualifier le besoin et proposer un rendez-vous par ${channel.toLowerCase()}`;
    const inserted =
      await db()`insert into sales_tasks(prospect_id,task_type,title,status,priority,due_at,source,generated_for_date) values(${prospect.id},'daily_plan',${title},'open',${Math.max(0, Math.min(100, Number(prospect.priority) || 50))},now(),'daily_action_plan',current_date) on conflict(prospect_id,task_type,generated_for_date) where generated_for_date is not null do nothing returning id`;
    if (inserted.length) {
      created++;
      await db()`insert into prospect_events(prospect_id,event_type,payload) values(${prospect.id},'daily_action_generated',${db().json({ taskId: inserted[0].id, title, channel })})`;
    }
  }
  return { created, paused: false, considered: candidates.length };
}
