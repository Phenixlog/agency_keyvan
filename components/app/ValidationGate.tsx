import { ClipboardCheck } from "lucide-react";
import { Empty } from "@/components/ui";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { resumeOnboarding } from "@/app/(app)/app/onboarding-actions";

/** Studio and Calendar stay closed until the client's Brand OS is validated: one onboards, then one produces. */
export function ValidationGate({ brandName, feature }: { brandName: string; feature: string }) {
  return (
    <Empty
      title={`${brandName} n’est pas encore validée`}
      action={
        <form action={resumeOnboarding}>
          <SubmitButton pendingLabel="Ouverture…">
            <ClipboardCheck size={18} strokeWidth={1.75} /> Relire et valider le Brand OS
          </SubmitButton>
        </form>
      }
    >
      {feature} s’ouvre une fois le Brand OS de ce client validé : c’est ce qui garantit que tout ce qui sort lui ressemble. Une relecture, un clic, et vous produisez.
    </Empty>
  );
}
