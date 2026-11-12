# SF-127 real-backend fixture (e2e/real-api/control-plane-billing.spec.ts).
#
# Run by the spec inside the simplefit-api checkout:
#
#     MIX_ENV=dev DATABASE_URL=<disposable e2e database> mix run <this file> world <stamp>
#
# Refuses any database whose name lacks "e2e". Through SimpleFit's public contexts it
# makes four set-up gyms, publishes a SaaS plan (catalog commands are refused only in
# production builds) and has each owner request a subscription. One is activated
# through the real activation path with the Stripe provider, trusted in this process
# only (as config/runtime.exs trusts it when Stripe is configured), from a verified
# paid test-mode invoice. What Stripe itself would have recorded (the subscription link,
# invoices, a failed webhook event) is inserted as rows satisfying every constraint: no
# Stripe API, real or mocked, runs in this E2E. Stripe ids, hosted URLs and the event id
# carry a canary the pages must never show.
#
# Prints `GYM <key> <id> <name>`, `SUB <key> <id>` and `PLAN <key>`.

alias SimpleFit.{Accounts, Billing, Gyms, Repo}
alias SimpleFit.Billing.{Catalog, Subscriptions}
alias SimpleFit.Billing.Stripe.{Invoice, Provider, SubscriptionLink, VerifiedInvoice, WebhookEvent}

%{rows: [[database]]} = Repo.query!("select current_database()")

unless database =~ "e2e" and database != "simple_fit_dev" do
  raise "refusing non-disposable database #{inspect(database)}"
end

Application.put_env(:simple_fit, SimpleFit.Legal,
  registry_path: Path.expand("test/support/legal"),
  allow_test_fixtures: true
)

SimpleFit.Legal.Registry.load()
Application.put_env(:simple_fit, SimpleFit.Billing, trusted_providers: [Provider])

ip = "203.0.113.27"

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

gym! = fn stamp, key, name ->
  owner = person.("sf127-#{key}-#{stamp}@e2e.example", "Owner #{key}")

  {:ok, gym, :created} =
    Gyms.create_gym(
      owner,
      %{"client_request_id" => Ecto.UUID.generate(), "name" => name, "gym_type" => "boxing_club"},
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
  {owner, gym}
end

canary = fn stamp -> "SF127CANARY#{String.upcase(stamp)}" end

link! = fn mode, gym_id, subscription_id, status, discrepancy, stamp, n ->
  Repo.insert!(%SubscriptionLink{
    mode: mode,
    gym_id: gym_id,
    subscription_id: subscription_id,
    stripe_subscription_id: "sub_#{canary.(stamp)}#{n}",
    stripe_customer_id: "cus_#{canary.(stamp)}#{n}",
    provider_status: status,
    discrepancy: discrepancy,
    synced_at: DateTime.utc_now()
  })
end

invoice! = fn mode, gym_id, subscription_id, id, attrs ->
  now = DateTime.utc_now()

  Repo.insert!(
    struct(
      Invoice,
      Map.merge(
        %{
          mode: mode,
          gym_id: gym_id,
          subscription_id: subscription_id,
          stripe_invoice_id: id,
          currency: "PLN",
          amount_refunded: 0,
          hosted_invoice_url: "https://invoice.stripe.com/i/#{id}",
          invoice_pdf: "https://pay.stripe.com/invoice/#{id}/pdf",
          provider_created_at: now,
          synced_at: now
        },
        attrs
      )
    )
  )
end

case System.argv() do
  ["world", stamp] ->
    key = "sf127_#{stamp}"

    {:ok, draft} =
      Catalog.draft(
        key,
        %{
          "name" => "SF127 Starter",
          "description" => "E2E plan",
          "price_source" => "product_decision",
          "prices" => [%{"interval" => "month", "currency" => "PLN", "amount" => "149"}],
          "entitlements" => [%{"feature_key" => "gym.member_management"}]
        },
        "e2e"
      )

    {:ok, version} = Catalog.publish(draft.id, "SF-127-E2E", "e2e")
    [price] = version.prices
    IO.puts("PLAN #{key}")

    request = fn owner, gym ->
      {:ok, %{session: session}} = Accounts.create_session(owner)

      {:ok, {subscription, :created}} =
        Billing.request_gym_subscription(owner, session, gym.id, %{
          "plan_version_id" => version.id,
          "price_version_id" => price.id,
          "client_request_id" => Ecto.UUID.generate()
        })

      subscription
    end

    now = DateTime.utc_now()
    period_end = DateTime.add(now, 30 * 86_400)
    c = canary.(stamp)

    # Alpha: paid in test mode, active; then a failed renewal attempt.
    {alpha_owner, alpha} = gym!.(stamp, "alpha", "SF127 Alpha Boxing #{stamp}")
    alpha_sub = request.(alpha_owner, alpha)
    link!.(:test, alpha.id, alpha_sub.id, :past_due, nil, stamp, 1)
    paid_id = "in_#{c}1"

    invoice!.(:test, alpha.id, alpha_sub.id, paid_id, %{
      number: "SF127-#{stamp}-1",
      status: :paid,
      payment_status: :succeeded,
      amount_due: 14_900,
      amount_paid: 14_900,
      amount_remaining: 0,
      total: 14_900,
      period_start: now,
      period_end: period_end,
      paid_at: now,
      attempt_count: 1
    })

    {:ok, _} =
      Subscriptions.activate(alpha_sub.id, Provider, %VerifiedInvoice{
        mode: :test,
        invoice_id: paid_id,
        status: :paid,
        period_start: now,
        period_end: period_end
      })

    invoice!.(:test, alpha.id, alpha_sub.id, "in_#{c}2", %{
      number: "SF127-#{stamp}-2",
      status: :open,
      payment_status: :requires_payment_method,
      amount_due: 14_900,
      amount_paid: 0,
      amount_remaining: 14_900,
      total: 14_900,
      provider_created_at: DateTime.add(now, 1),
      attempt_count: 1
    })

    # Bravo: a paid invoice for another amount: a discrepancy, nothing granted.
    {bravo_owner, bravo} = gym!.(stamp, "bravo", "SF127 Bravo Boxing #{stamp}")
    bravo_sub = request.(bravo_owner, bravo)
    link!.(:test, bravo.id, bravo_sub.id, :incomplete, "invoice_amount_mismatch", stamp, 2)

    invoice!.(:test, bravo.id, bravo_sub.id, "in_#{c}3", %{
      number: "SF127-#{stamp}-3",
      status: :paid,
      payment_status: :succeeded,
      amount_due: 100,
      amount_paid: 100,
      amount_remaining: 0,
      total: 100,
      paid_at: now
    })

    # Live: live-mode records only; never in a test figure.
    {live_owner, live} = gym!.(stamp, "live", "SF127 Live Boxing #{stamp}")
    live_sub = request.(live_owner, live)
    link!.(:live, live.id, live_sub.id, :incomplete, nil, stamp, 3)

    invoice!.(:live, live.id, live_sub.id, "in_#{c}4", %{
      number: "SF127-#{stamp}-4",
      status: :paid,
      payment_status: :succeeded,
      amount_due: 99_900,
      amount_paid: 99_900,
      amount_remaining: 0,
      total: 99_900,
      paid_at: now
    })

    # Idle: an intent with no provider record at all.
    {idle_owner, idle} = gym!.(stamp, "idle", "SF127 Idle Boxing #{stamp}")
    idle_sub = request.(idle_owner, idle)

    Repo.insert!(%WebhookEvent{
      mode: :test,
      stripe_event_id: "evt_#{c}",
      event_type: "invoice.paid",
      object_type: "invoice",
      object_id: paid_id,
      event_created_at: now,
      status: :failed,
      outcome: "retries_exhausted",
      attempts: 5,
      processed_at: now
    })

    for {k, gym, sub} <- [
          {"alpha", alpha, alpha_sub},
          {"bravo", bravo, bravo_sub},
          {"live", live, live_sub},
          {"idle", idle, idle_sub}
        ] do
      IO.puts("GYM #{k} #{gym.id} #{gym.name}")
      IO.puts("SUB #{k} #{sub.id}")
    end

    IO.puts("CANARY #{c}")
end
