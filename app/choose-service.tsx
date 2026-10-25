import { OnboardingInfoScreen } from "@/components/OnboardingInfoScreen";

export default function ChooseServiceScreen() {
  return (
    <OnboardingInfoScreen
      activeSteps={5}
      title="Choose the Right Service"
      titleWidth={320}
      titleFontSize={24}
      body={
        "View mechanic profiles, available services,\nestimated prices, ratings, and reviews to help\nyou choose a service provider that suits your\nneeds."
      }
      bodyWidth={320}
      bodyFontSize={16}
      bodyLineHeight={26}
      largeText
      nextRoute="/setup-complete"
    />
  );
}