# SF-120 real-backend fixture (e2e/real-api/control-plane.spec.ts).
#
# Run by the spec inside the simplefit-api checkout:
#
#     MIX_ENV=dev DATABASE_URL=<disposable e2e database> mix run <this file> user <email>
#
# It only calls SimpleFit's public context functions, on a database whose name
# contains "e2e" (anything else is refused before a write), and prints one line:
# `USER <id>`. The account has an email identity (signs in with an emailed code),
# a completed account registration and a completed Fighter profile, so the web
# entry has nothing mandatory left and honours the sign-in continuation.
#
# Test-only legal fixtures (simplefit-api/test/support/legal) are loaded in memory
# for this process, as the API server of the run loads them.

alias SimpleFit.{Accounts, Fighters, Repo}

%{rows: [[database]]} = Repo.query!("select current_database()")

unless database =~ "e2e" and database != "simple_fit_dev" do
  raise "refusing non-disposable database #{inspect(database)}"
end

Application.put_env(:simple_fit, SimpleFit.Legal,
  registry_path: Path.expand("test/support/legal"),
  allow_test_fixtures: true
)

SimpleFit.Legal.Registry.load()

case System.argv() do
  ["user", email] ->
    {:ok, user} = Accounts.register_user(:email, email)

    {:ok, _} =
      Accounts.update_account_registration(user, %{
        "full_name" => "E2E Operator",
        "date_of_birth" => "1990-04-12",
        "accept_terms" => true,
        "accept_privacy" => true
      })

    {:ok, %{status: :complete}} = Accounts.complete_account_registration(user)

    {:ok, _} =
      Fighters.update_profile(user, %{
        "display_name" => "E2E Operator",
        "username" => "e2e_#{Base.encode16(:crypto.strong_rand_bytes(5), case: :lower)}",
        "country_code" => "PL",
        "city" => "Warsaw",
        "experience_level" => "amateur",
        "stance" => "orthodox"
      })

    {:ok, _} = Fighters.complete_onboarding(user)
    IO.puts("USER #{user.id}")
end
