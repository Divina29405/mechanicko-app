import { OnboardingInfoScreen } from "@/components/OnboardingInfoScreen";

export default function HelpWhenNeededScreen() {
  return (
    <OnboardingInfoScreen
      activeSteps={4}
      title="Help When You Need It"
      titleWidth={240}
      titleFontSize={24}
      body={
        "Book a regular service, schedule an\nappointment, or use the SOS feature to\nrequest emergency roadside assistance\nwhen your vehicle encounters trouble."
      }
      bodyWidth={320}
      bodyFontSize={16}
      bodyLineHeight={26}
      largeText
      nextRoute="/choose-service"
    />
  );
}