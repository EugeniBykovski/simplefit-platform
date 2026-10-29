# SF-94 real-backend fixture (e2e/real-api/gym-staff.spec.ts, scenario Q).
#
# Run by the spec inside the simplefit-api checkout:
#
#     MIX_ENV=dev DATABASE_URL=<disposable e2e database> COACHING_* \
#       mix run --no-start <this file> <tag>
#
# Creates, through SimpleFit's own context functions, a coach and a fighter
# outside every gym, an active Coach–Fighter relationship between them (the
# trusted activation the invitation acceptance uses) and one planned
# training session. Refused on any database whose name does not contain
# "e2e". Prints one line: `<relationship id> <session id> <coach email>`.
#
# Test-only legal fixtures (simplefit-api/test/support/legal) are loaded in
# memory for this process, as the API server of the run loads them.

{:ok, _} = Application.ensure_all_started(:simple_fit)

alias SimpleFit.{Accounts, Coaches, Fighters, Repo, Training}
alias SimpleFit.Coaching.Activation

%{rows: [[database]]} = Repo.query!("select current_database()")

unless database =~ "e2e" and database != "simple_fit_dev" do
  raise "refusing non-disposable database #{inspect(database)}"
end

Application.put_env(:simple_fit, SimpleFit.Legal,
  registry_path: Path.expand("test/support/legal"),
  allow_test_fixtures: true
)

SimpleFit.Legal.Registry.load()

[tag] = System.argv()

register = fn email, name ->
  {:ok, user} = Accounts.register_user(:email, email)

  {:ok, _} =
    Accounts.update_account_registration(user, %{
      "full_name" => name,
      "date_of_birth" => "1990-04-12",
      "accept_terms" => true,
      "accept_privacy" => true
    })

  {:ok, %{status: :complete}} = Accounts.complete_account_registration(user)
  user
end

coach_email = "e2e-sf94-outside-coach-#{tag}@example.com"
coach = register.(coach_email, "Marek Trener")

{:ok, _} =
  Coaches.update_profile(coach, %{
    "display_name" => "Coach Marek",
    "brand_name" => "Marek Boxing",
    "country_code" => "PL",
    "city" => "Warsaw",
    "coaching_formats" => ["personal_training"]
  })

{:ok, _} = Coaches.complete_onboarding(coach)

fighter = register.("e2e-sf94-fighter-#{tag}@example.com", "Kasia Fighter")

{:ok, _} =
  Fighters.update_profile(fighter, %{
    "display_name" => "Kasia F.",
    "username" => "e2e_sf94_#{tag}",
    "country_code" => "PL",
    "city" => "Warsaw",
    "experience_level" => "amateur",
    "stance" => "orthodox"
  })

{:ok, _} = Fighters.complete_onboarding(fighter)

version = SimpleFit.Coaching.LegalPolicy.current_disclosure()
{:ok, relationship, _} = Activation.activate(Coaches.get_profile(coach).id, fighter, version)

starts_at =
  DateTime.utc_now() |> DateTime.add(2 * 86_400) |> DateTime.truncate(:second) |> DateTime.to_iso8601()

{:ok, session, :created} =
  Training.create_session(coach, %{
    "relationship_id" => relationship.id,
    "client_request_id" => Ecto.UUID.generate(),
    "title" => "Private sparring plan",
    "training_type" => "technical",
    "starts_at" => starts_at,
    "time_zone" => "Europe/Warsaw",
    "duration_minutes" => 60,
    "notes" => "private notes"
  })

IO.puts("#{relationship.id} #{session.id} #{coach_email}")
