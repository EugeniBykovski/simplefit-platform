import { placeholderRoute } from "@/widgets/feature-placeholder";

const route = placeholderRoute("web.app.community");

export const generateMetadata = route.generateMetadata;
export default route.Page;
