import { placeholderRoute } from "@/widgets/feature-placeholder";

const route = placeholderRoute("web.app.gym.members._member-id");

export const generateMetadata = route.generateMetadata;
export default route.Page;
