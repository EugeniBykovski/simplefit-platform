import { placeholderRoute } from "@/widgets/feature-placeholder";

const route = placeholderRoute("web.pricing");

export const generateMetadata = route.generateMetadata;
export default route.Page;
