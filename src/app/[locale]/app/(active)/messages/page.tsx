import { placeholderRoute } from "@/widgets/feature-placeholder";

const route = placeholderRoute("web.app.messages");

export const generateMetadata = route.generateMetadata;
export default route.Page;
