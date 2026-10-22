# SF-78 real-backend fixtures (e2e/real-api/email-identity-link.spec.ts).
#
# Run by the spec inside the simplefit-api checkout:
#
#     MIX_ENV=dev DATABASE_URL=<disposable e2e database> COACHING_* \
#       mix run <this file> <command> <args...>
#
# It only calls SimpleFit's public context functions, on a database whose
# name contains "e2e" (anything else is refused before a write). It prints
# one line per result, `KEY value`, and nothing else; tokens it prints are
# test credentials of that disposable database, read by the spec only.
#
#   user <google|apple|email> <subject> [fighter]   a registered user (with a
#       completed fighter profile when `fighter`) and a new session:
#       REFRESH <refresh token>
#   session <google|apple|email> <subject>           another session: REFRESH
#   invite <address>                                 a new coach invites the
#       address: INVITE <sfi_ token from the queued E08>
#
# Test-only legal fixtures (simplefit-api/test/support/legal) are loaded in
# memory for this process, as the API server of the run loads them; nothing is
# written to the production registry.

import Ecto.Query, only: [from: 2]

alias SimpleFit.{Accounts, Coaches, Coaching, Fighters, Repo}

%{rows: [[database]]} = Repo.query!("select current_database()")

unless database =~ "e2e" and database != "simple_fit_dev" do
  raise "refusing non-disposable database #{inspect(database)}"
end

Application.put_env(:simple_fit, SimpleFit.Legal,
  registry_path: Path.expand("test/support/legal"),
  allow_test_fixtures: true
)

SimpleFit.Legal.Registry.load()

# Random, not System.unique_integer/1: every `mix run` is a fresh VM whose
# counter starts over, so counters collide across runs.
unique = fn -> Base.encode16(:crypto.strong_rand_bytes(6), case: :lower) end

register = fn user, name ->
  {:ok, _} =
    Accounts.update_account_registration(user, %{
      "full_name" => name,
      "date_of_birth" => "1995-04-12",
      "accept_terms" => true,
      "accept_privacy" => true
    })

  {:ok, %{status: :complete}} = Accounts.complete_account_registration(user)
  user
end

fighter = fn user ->
  handle = "e2e_#{unique.()}"

  {:ok, _} =
    Fighters.update_profile(user, %{
      "display_name" => "E2E Fighter",
      "username" => handle,
      "country_code" => "PL",
      "city" => "Warsaw",
      "experience_level" => "amateur",
      "stance" => "orthodox"
    })

  {:ok, _} = Fighters.complete_onboarding(user)
  user
end

session = fn user ->
  {:ok, credentials} = Accounts.create_session(user)
  IO.puts("REFRESH #{credentials.refresh_token}")
end

provider = fn name when name in ["google", "apple", "email"] -> String.to_existing_atom(name) end

case System.argv() do
  ["user", kind, subject | rest] ->
    {:ok, user} = Accounts.register_user(provider.(kind), subject)
    user = register.(user, "E2E #{kind}")
    if rest == ["fighter"], do: fighter.(user)
    session.(user)

  ["session", kind, subject] ->
    {:ok, user} = Accounts.resolve_user(provider.(kind), subject)
    session.(user)

  ["invite", address] ->
    {:ok, coach} = Accounts.register_user(:google, "e2e-coach-#{unique.()}")
    register.(coach, "Coach Marek")

    {:ok, _} =
      Coaches.update_profile(coach, %{
        "display_name" => "Coach Marek",
        "brand_name" => "Marek Boxing",
        "country_code" => "PL",
        "city" => "Warsaw",
        "coaching_formats" => ["personal_training"]
      })

    {:ok, _} = Coaches.complete_onboarding(coach)
    rules = Application.fetch_env!(:simple_fit, SimpleFit.Coaching)[:data_rules_version]

    {:ok, _} =
      Coaching.acknowledge_coach_data_rules(coach, %{
        "document_version" => rules,
        "document_language" => "en"
      })

    {:ok, _invitation, :created} =
      Coaching.invite(coach, %{"email" => address}, "198.51.100.#{:rand.uniform(250)}")

    token =
      from(j in Oban.Job,
        where: j.worker == "SimpleFit.Email.DeliveryWorker",
        order_by: [desc: j.id],
        select: j.args
      )
      |> Repo.all()
      |> Enum.find_value(fn args ->
        with {:ok, %{to: [^address], text: text}} <-
               SimpleFit.Email.JobPayload.open(args["payload"]),
             [_, token] <- Regex.run(~r"/invite/coach#token=(sfi_[A-Za-z0-9_-]{43})", text) do
          token
        else
          _ -> nil
        end
      end)

    IO.puts("INVITE #{token}")
end
