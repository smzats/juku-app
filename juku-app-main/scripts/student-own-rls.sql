-- 生徒は自分の ID の行だけを読み書きできる。
-- 教員・管理者は teachers.role が teacher または admin のとき、運用データを読み書きできる。
-- 判定は auth.users の email（ID@juku.app）と public.teachers / public.students を使う。
-- user_metadata は本人が書き換えられるため、権限判定には使わない。

create or replace function public.app_login_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select nullif(split_part(coalesce(auth.jwt() ->> 'email', ''), '@', 1), '');
$$;

create or replace function public.app_is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.teachers
    where lower(id) = lower(public.app_login_id())
      and role in ('admin', 'teacher')
  );
$$;

create or replace function public.app_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.teachers
    where lower(id) = lower(public.app_login_id())
      and role = 'admin'
  );
$$;

create or replace function public.app_is_student()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.students
    where lower(id) = lower(public.app_login_id())
  );
$$;

revoke all on function public.app_login_id() from public;
revoke all on function public.app_is_staff() from public;
revoke all on function public.app_is_admin() from public;
revoke all on function public.app_is_student() from public;
grant execute on function public.app_login_id() to authenticated;
grant execute on function public.app_is_staff() to authenticated;
grant execute on function public.app_is_admin() to authenticated;
grant execute on function public.app_is_student() to authenticated;

do $$
declare
  target text;
  pol record;
begin
  foreach target in array array[
    'study_logs',
    'teacher_messages',
    'weekly_schedules',
    'student_schedule_templates',
    'student_favorites',
    'materials',
    'students',
    'teachers'
  ]
  loop
    execute format('alter table public.%I enable row level security', target);
    for pol in
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename = target
    loop
      execute format('drop policy if exists %I on public.%I', pol.policyname, target);
    end loop;
    execute format('grant select, insert, update, delete on public.%I to authenticated', target);
    execute format('revoke insert, update, delete on public.%I from anon', target);
  end loop;
end $$;

create policy ylog_students_select on public.students
for select to authenticated
using (
  public.app_is_staff()
  or (public.app_is_student() and lower(id) = lower(public.app_login_id()))
);

create policy ylog_students_insert on public.students
for insert to authenticated
with check (public.app_is_staff());

create policy ylog_students_update on public.students
for update to authenticated
using (
  public.app_is_admin()
  or exists (
    select 1
    from public.teachers
    where lower(id) = lower(public.app_login_id())
      and role = 'teacher'
      and branch_id is not distinct from students.branch_id
  )
)
with check (
  public.app_is_admin()
  or exists (
    select 1
    from public.teachers
    where lower(id) = lower(public.app_login_id())
      and role = 'teacher'
      and branch_id is not distinct from students.branch_id
  )
);

create policy ylog_students_delete on public.students
for delete to authenticated
using (
  public.app_is_admin()
  or exists (
    select 1
    from public.teachers
    where lower(id) = lower(public.app_login_id())
      and role = 'teacher'
      and branch_id is not distinct from students.branch_id
  )
);

create policy ylog_teachers_select on public.teachers
for select to authenticated
using (public.app_is_staff());

create policy ylog_teachers_write on public.teachers
for all to authenticated
using (public.app_is_admin())
with check (public.app_is_admin());

create policy ylog_study_logs_own on public.study_logs
for all to authenticated
using (
  public.app_is_staff()
  or (public.app_is_student() and lower(student_id) = lower(public.app_login_id()))
)
with check (
  public.app_is_staff()
  or (public.app_is_student() and lower(student_id) = lower(public.app_login_id()))
);

create policy ylog_teacher_messages_read on public.teacher_messages
for select to authenticated
using (
  public.app_is_staff()
  or (public.app_is_student() and lower(student_id) = lower(public.app_login_id()))
);

create policy ylog_teacher_messages_insert on public.teacher_messages
for insert to authenticated
with check (public.app_is_staff());

create policy ylog_teacher_messages_update on public.teacher_messages
for update to authenticated
using (
  public.app_is_staff()
  or (public.app_is_student() and lower(student_id) = lower(public.app_login_id()))
)
with check (
  public.app_is_staff()
  or (public.app_is_student() and lower(student_id) = lower(public.app_login_id()))
);

create policy ylog_teacher_messages_delete on public.teacher_messages
for delete to authenticated
using (
  public.app_is_staff()
  or (public.app_is_student() and lower(student_id) = lower(public.app_login_id()))
);

create policy ylog_weekly_schedules_own on public.weekly_schedules
for all to authenticated
using (
  public.app_is_staff()
  or (public.app_is_student() and lower(student_id) = lower(public.app_login_id()))
)
with check (
  public.app_is_staff()
  or (public.app_is_student() and lower(student_id) = lower(public.app_login_id()))
);

create policy ylog_schedule_templates_own on public.student_schedule_templates
for all to authenticated
using (
  public.app_is_staff()
  or (public.app_is_student() and lower(student_id) = lower(public.app_login_id()))
)
with check (
  public.app_is_staff()
  or (public.app_is_student() and lower(student_id) = lower(public.app_login_id()))
);

create policy ylog_favorites_own on public.student_favorites
for all to authenticated
using (
  public.app_is_staff()
  or (public.app_is_student() and lower(student_id) = lower(public.app_login_id()))
)
with check (
  public.app_is_staff()
  or (public.app_is_student() and lower(student_id) = lower(public.app_login_id()))
);

create policy ylog_materials_select on public.materials
for select to authenticated
using (
  public.app_is_staff()
  or (
    public.app_is_student()
    and (
      coalesce(is_custom, false) = false
      or lower(coalesce(owner_student_id, '')) = lower(public.app_login_id())
    )
  )
);

create policy ylog_materials_insert on public.materials
for insert to authenticated
with check (
  public.app_is_staff()
  or (
    public.app_is_student()
    and coalesce(is_custom, false) = true
    and lower(coalesce(owner_student_id, '')) = lower(public.app_login_id())
  )
);

create policy ylog_materials_update on public.materials
for update to authenticated
using (
  public.app_is_staff()
  or (
    public.app_is_student()
    and coalesce(is_custom, false) = true
    and lower(coalesce(owner_student_id, '')) = lower(public.app_login_id())
  )
)
with check (
  public.app_is_staff()
  or (
    public.app_is_student()
    and coalesce(is_custom, false) = true
    and lower(coalesce(owner_student_id, '')) = lower(public.app_login_id())
  )
);

create policy ylog_materials_delete on public.materials
for delete to authenticated
using (
  public.app_is_staff()
  or (
    public.app_is_student()
    and coalesce(is_custom, false) = true
    and lower(coalesce(owner_student_id, '')) = lower(public.app_login_id())
  )
);
