# SF-124 real-backend fixture (e2e/real-api/control-plane-sponsor-review.spec.ts).
#
# Run by the spec inside the simplefit-api checkout, with the same storage settings as
# the API of the run (the local S3 stand-in, e2e/real-api/fixtures/s3-stub.mjs):
#
#     MIX_ENV=dev DATABASE_URL=<disposable e2e database> AWS_S3_... \
#       mix run <this file> applicant <email> <company> [document]
#
# It only calls SimpleFit's public context functions, on a database whose name contains
# "e2e" (anything else is refused before a write). It makes a person with an email
# identity and a completed account registration who saves a complete sponsor
# application and submits it, with one brand deck uploaded to storage through the
# presigned PUT when `document` is given (the stand-in checks no signature, so this is
# not a real-S3 test). It prints `APPLICATION <id> USER <id>`.
#
# Test-only legal fixtures (simplefit-api test/support/legal) are loaded in memory for
# this process, as the API server of the run loads them.

alias SimpleFit.{Accounts, Repo}
alias SimpleFit.Sponsors.{Applications, Evidence}

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
  ["applicant", email, company | rest] ->
    {:ok, user} = Accounts.register_user(:email, email)

    {:ok, _} =
      Accounts.update_account_registration(user, %{
        "full_name" => "Laura Weiss",
        "date_of_birth" => "1988-02-03",
        "accept_terms" => true,
        "accept_privacy" => true
      })

    {:ok, %{status: :complete}} = Accounts.complete_account_registration(user)

    {:ok, %{application: application}} =
      Applications.save(user, %{
        "client_request_id" => Ecto.UUID.generate(),
        "company_name" => company,
        "website" => "https://example.com",
        "country_code" => "DE",
        "industry" => "boxing_equipment",
        "contact_full_name" => "Laura Weiss",
        "contact_position" => "Head of Partnerships",
        "contact_email" => email,
        "contact_phone" => "+49301234567",
        "interests" => ["sponsored_events", "gym_partnerships"],
        "market_scope" => "countries",
        "market_countries" => ["PL", "DE"],
        "market_cities" => [],
        "budget_band" => "to_be_discussed",
        "goals" => "Support amateur boxing events."
      })

    revision =
      if rest == ["document"] do
        bytes = "%PDF-1.4 SF-124 e2e brand deck\n"

        {:ok, {_view, evidence, upload}} =
          Evidence.initiate(user, %{
            "expected_revision" => application.revision,
            "kind" => "brand_deck",
            "file_name" => "brand-deck.pdf",
            "content_type" => "application/pdf",
            "byte_size" => byte_size(bytes)
          })

        %{status: status} =
          Req.put!(upload.url, body: bytes, headers: Map.to_list(upload.headers), retry: false)

        if status not in 200..299, do: raise("the storage stand-in refused the upload")
        {:ok, view} = Evidence.confirm(user, evidence.id)
        view.application.revision
      else
        application.revision
      end

    {:ok, %{application: submitted}} =
      Applications.submit(user, %{
        "expected_revision" => revision,
        "client_request_id" => Ecto.UUID.generate(),
        "declaration_accepted" => true,
        "declaration_version" => "sponsor-application-declaration-test-1",
        "declaration_language" => "en"
      })

    IO.puts("APPLICATION #{submitted.id} USER #{user.id}")
end
