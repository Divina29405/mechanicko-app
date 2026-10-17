import { OnboardingInfoScreen } from "@/components/OnboardingInfoScreen";

export default function HelpWhenNeededScreen() {
  return (
    <OnboardingInfoScreen
      activeSteps={4}
      title="Help When You Need It"
      titleWidth={195}
      titleFontSize={21}
      body={
        "Book a regular service, schedule an\nappointment, or use the SOS feature to\nrequest emergency roadside assistance\nwhen your vehicle encounters trouble."
      }
      bodyWidth={297}
      bodyFontSize={15}
      bodyLineHeight={24}
      largeText
      nextRoute="/choose-service"
    />
  );
}
