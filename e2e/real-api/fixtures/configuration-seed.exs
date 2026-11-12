# SF-128 real-backend fixture (e2e/real-api/control-plane-configuration.spec.ts).
#
# Run by the spec inside the simplefit-api checkout:
#
#     MIX_ENV=dev DATABASE_URL=<disposable e2e database> mix run <this file> gym <stamp>
#     MIX_ENV=dev DATABASE_URL=<disposable e2e database> mix run <this file> invite <owner id> <gym id> <email>
#
# Refuses any database whose name lacks "e2e". `gym` makes an owner with a completed gym
# through SimpleFit's public contexts and prints `OWNER <id>` and `GYM <id>`. `invite`
# asks the real consumer, `Gyms.create_member_invitation/4`, in this separate BEAM (a
# second application instance sharing the database), and prints `INVITED` or `REFUSED
# <code>`: the effective switch as another instance sees it.

alias SimpleFit.{Accounts, Gyms, Repo}

%{rows: [[database]]} = Repo.query!("select current_database()")

unless database =~ "e2e" and database != "simple_fit_dev" do
  raise "refusing non-disposable database #{inspect(database)}"
end

Application.put_env(:simple_fit, SimpleFit.Legal,
  registry_path: Path.expand("test/support/legal"),
  allow_test_fixtures: true
)

SimpleFit.Legal.Registry.load()

ip = "203.0.113.28"

case System.argv() do
  ["gym", stamp] ->
    {:ok, owner} = Accounts.register_user(:email, "sf128-owner-#{stamp}@e2e.example")

    {:ok, _} =
      Accounts.update_account_registration(owner, %{
        "full_name" => "Owner Configuration",
        "date_of_birth" => "1990-04-12",
        "accept_terms" => true,
        "accept_privacy" => true
      })

    {:ok, %{status: :complete}} = Accounts.complete_account_registration(owner)

    {:ok, gym, :created} =
      Gyms.create_gym(
        owner,
        %{
          "client_request_id" => Ecto.UUID.generate(),
          "name" => "SF128 Gym #{stamp}",
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
    IO.puts("OWNER #{owner.id}")
    IO.puts("GYM #{gym.id}")

  ["invite", owner_id, gym_id, email] ->
    owner = Repo.get!(Accounts.User, owner_id)

    case Gyms.create_member_invitation(owner, gym_id, %{"email" => email}, ip) do
      {:ok, _view, _} -> IO.puts("INVITED")
      {:error, {:conflict, details}} -> IO.puts("REFUSED #{inspect(details)}")
      {:error, other} -> IO.puts("REFUSED #{inspect(other)}")
    end
end
