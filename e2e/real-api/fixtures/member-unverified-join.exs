# SF-96 real-backend fixture (e2e/real-api/gym-members.spec.ts, scenario R).
#
# Run by the spec inside the simplefit-api checkout:
#
#     MIX_ENV=dev DATABASE_URL=<disposable e2e database> \
#       mix run --no-start <this file> <tag>
#
# The join code is read from the environment (SF96_JOIN_CODE), never from
# the command line, and is never printed.
#
# Creates, through SimpleFit's own context functions, a completed account
# that holds no sign-in identity (so it has no verified identity, as the
# SF-95 tests make one), gives it a session, and lets it join the gym with
# the code through `SimpleFit.Gyms.join_gym/4`, the function the join
# endpoint calls. Refused on any database whose name does not contain "e2e".
# Prints one line: `<user id> <membership status> <auto_approved>`.
#
# Test-only legal fixtures (simplefit-api/test/support/legal) are loaded in
# memory for this process, as the API server of the run loads them.

{:ok, _} = Application.ensure_all_started(:simple_fit)

import Ecto.Query, only: [from: 2]

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

[tag] = System.argv()
code = System.fetch_env!("SF96_JOIN_CODE")

{:ok, user} = Accounts.register_user(:email, "e2e-sf96-unverified-#{tag}@example.com")

{:ok, _} =
  Accounts.update_account_registration(user, %{
    "full_name" => "Nina Niezweryfikowana",
    "date_of_birth" => "1991-02-03",
    "accept_terms" => true,
    "accept_privacy" => true
  })

{:ok, %{status: :complete}} = Accounts.complete_account_registration(user)

# No sign-in identity: the account cannot prove an address, so it is unverified.
Repo.delete_all(from(i in "identities", where: i.user_id == type(^user.id, :binary_id)))
false = Accounts.verified_identity?(user)

{:ok, %{session: session}} = Accounts.create_session(user)
{:ok, membership, _outcome} = Gyms.join_gym(user, session, code, "e2e-sf96-fixture")

IO.puts("#{user.id} #{membership.status} #{membership.auto_approved}")
