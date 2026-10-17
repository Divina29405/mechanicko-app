import { OnboardingInfoScreen } from "@/components/OnboardingInfoScreen";

export default function ChooseServiceScreen() {
  return (
    <OnboardingInfoScreen
      activeSteps={5}
      title="Choose the Right Service"
      titleWidth={310}
      titleFontSize={21}
      body={
        "View mechanic profiles, available services,\nestimated prices, ratings, and reviews to help\nyou choose a service provider that suits your\nneeds."
      }
      bodyWidth={304}
      bodyFontSize={15}
      bodyLineHeight={24}
      largeText
      nextRoute="/setup-complete"
    />
  );
}
