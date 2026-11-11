# SF-126 real-backend fixture (e2e/real-api/control-plane-operations.spec.ts).
#
#     MIX_ENV=dev DATABASE_URL=<disposable e2e database> mix run <this file> jobs <stamp>
#
# On a database whose name contains "e2e" only (anything else is refused before a
# write), it inserts background jobs through Oban for real workers, with arguments,
# meta and an error text that carry the canary `SF126-CANARY-<stamp>`, and moves them to
# states the running API never executes: a discarded email delivery (as a worker that
# ran out of attempts leaves it), a completed cleanup and a cleanup scheduled a day
# ahead. The canary must never reach the browser. It prints `DISCARDED <job id>`.

alias SimpleFit.Repo
import Ecto.Query, only: [from: 2]

%{rows: [[database]]} = Repo.query!("select current_database()")

unless database =~ "e2e" and database != "simple_fit_dev" do
  raise "refusing non-disposable database #{inspect(database)}"
end

case System.argv() do
  ["jobs", stamp] ->
    canary = "SF126-CANARY-#{stamp}"
    now = DateTime.utc_now()

    insert = fn worker, args, opts ->
      worker.new(Map.merge(args, %{"canary" => canary}), opts)
      |> Ecto.Changeset.put_change(:meta, %{"canary" => canary})
      |> then(&Oban.insert!(&1))
    end

    discarded =
      insert.(SimpleFit.Email.DeliveryWorker, %{"payload" => "#{canary}-payload"},
        scheduled_at: DateTime.add(now, 86_400)
      )

    {1, _} =
      Repo.update_all(from(j in Oban.Job, where: j.id == ^discarded.id),
        set: [
          state: "discarded",
          attempt: 5,
          attempted_at: now,
          discarded_at: now,
          errors: [
            %{
              "at" => DateTime.to_iso8601(now),
              "attempt" => 5,
              "error" => "** (Oban.PerformError) #{canary} failed with {:error, :timeout}"
            }
          ]
        ]
      )

    completed =
      insert.(SimpleFit.Gyms.VerificationCleanupWorker, %{}, scheduled_at: DateTime.add(now, 86_400))

    {1, _} =
      Repo.update_all(from(j in Oban.Job, where: j.id == ^completed.id),
        set: [state: "completed", attempt: 1, attempted_at: now, completed_at: now]
      )

    _scheduled =
      insert.(SimpleFit.Sponsors.EvidenceCleanupWorker, %{}, scheduled_at: DateTime.add(now, 86_400))

    IO.puts("DISCARDED #{discarded.id}")
end
