# SF-123 real-backend fixture (e2e/real-api/control-plane-oversight.spec.ts).
#
# Run by the spec inside the simplefit-api checkout:
#
#     MIX_ENV=dev DATABASE_URL=<disposable e2e database> mix run <this file> world <stamp>
#
# It only calls SimpleFit's public context functions, on a database whose name
# contains "e2e" (anything else is refused before a write). It makes a set-up gym
# whose owner is "Natalia Wiśniewska", with one approved member; a coach with a bio
# and a fighter with body data, goals and a next fight, in an active relationship with
# a planned session carrying a note. The bio, member name, note, weight and fight are
# canaries the operator views must never show. It prints `GYM <id> <name>`,
# `OWNER <id> <email>`, `COACH <user id> <email>` and `FIGHTER <user id> <username>`.
#
# Test-only legal fixtures and the test sharing configuration (simplefit-api
# test/support) are loaded in memory for this process only.

alias SimpleFit.{Accounts, Coaches, Fighters, Gyms, Repo, Training}
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

disclosure = "fighter-coach-disclosure-test-1"
data_rules = "coach-data-rules-test-1"

Application.put_env(:simple_fit, SimpleFit.Coaching,
  access_enabled: true,
  disclosures: %{disclosure => :basic_profile},
  current_disclosure: disclosure,
  data_rules_version: data_rules
)

ip = "203.0.113.23"

person = fn email, full_name ->
  {:ok, user} = Accounts.register_user(:email, email)

  {:ok, _} =
    Accounts.update_account_registration(user, %{
      "full_name" => full_name,
      "date_of_birth" => "1990-04-12",
      "accept_terms" => true,
      "accept_privacy" => true
    })

  {:ok, %{status: :complete}} = Accounts.complete_account_registration(user)
  user
end

fighter! = fn user, username ->
  {:ok, _} =
    Fighters.update_profile(user, %{
      "display_name" => "Alex K.",
      "username" => username,
      "country_code" => "PL",
      "city" => "Gdańsk",
      "experience_level" => "amateur",
      "stance" => "southpaw"
    })

  {:ok, _} = Fighters.complete_onboarding(user)
end

case System.argv() do
  ["world", stamp] ->
    owner = person.("sf123-owner-#{stamp}@e2e.example", "Natalia Wiśniewska")
    name = "SF123 Gym #{stamp}"

    {:ok, gym, :created} =
      Gyms.create_gym(
        owner,
        %{
          "client_request_id" => Ecto.UUID.generate(),
          "name" => name,
          "gym_type" => "boxing_club"
        },
        ip
      )

    {:ok, setup} = Gyms.get_setup(owner, gym.id)

    {:ok, _} =
      Gyms.put_primary_location(owner, gym.id, %{
        "expected_revision" => setup.revision,
        "name" => "Kazimierz",
        "country_code" => "PL",
        "city" => "Kraków",
        "address_line" => "ul. Józefa 12"
      })

    {:ok, _, _} = Gyms.complete_setup(owner, gym.id)

    {:ok, %{join_code: code}} = Gyms.rotate_join_code(owner, gym.id)
    member = person.("sf123-member-#{stamp}@e2e.example", "Memberka Canary")
    {:ok, %{session: session}} = Accounts.create_session(member)
    {:ok, joined, :created} = Gyms.join_gym(member, session, code, ip)
    {:ok, _} = Gyms.approve_join_request(owner, gym.id, joined.gym_member_id)

    coach_email = "sf123-coach-#{stamp}@e2e.example"
    coach = person.(coach_email, "Marek Nowak")

    {:ok, _} =
      Coaches.update_profile(coach, %{
        "display_name" => "Coach Marek",
        "brand_name" => "Marek Boxing",
        "country_code" => "PL",
        "city" => "Warsaw",
        "bio" => "Biocanary story of the coach",
        "coaching_formats" => ["personal_training"]
      })

    {:ok, _} = Coaches.complete_onboarding(coach)

    {:ok, _} =
      SimpleFit.Coaching.acknowledge_coach_data_rules(coach, %{
        "document_version" => data_rules,
        "document_language" => "en"
      })

    username = "sf123_#{stamp}"
    fighter = person.("sf123-fighter-#{stamp}@e2e.example", "Fightercanary Name")
    fighter!.(fighter, username)

    {:ok, _} =
      Fighters.update_profile(fighter, %{
        "current_weight_kg" => "71.5",
        "height_cm" => 178,
        "goals" => ["competition"],
        "next_fight_name" => "Fightcanary Cup"
      })

    {:ok, relationship, _} =
      Activation.activate(Coaches.get_profile(coach).id, fighter, disclosure)

    starts =
      DateTime.utc_now() |> DateTime.add(2, :day) |> DateTime.truncate(:second)

    {:ok, _, :created} =
      Training.create_session(coach, %{
        "relationship_id" => relationship.id,
        "client_request_id" => Ecto.UUID.generate(),
        "title" => "Technical boxing",
        "training_type" => "technical",
        "starts_at" => DateTime.to_iso8601(starts),
        "time_zone" => "Europe/Warsaw",
        "duration_minutes" => 60,
        "notes" => "Notecanary jab work"
      })

    IO.puts("GYM #{gym.id} #{name}")
    IO.puts("OWNER #{owner.id} sf123-owner-#{stamp}@e2e.example")
    IO.puts("COACH #{coach.id} #{coach_email}")
    IO.puts("FIGHTER #{fighter.id} #{username}")
end
